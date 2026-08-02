import { watch } from "node:fs";
import path from "node:path";
import { boundedInteger } from "./bounds.js";
import { safeId, sanitizeText } from "./sanitize.js";

const LEDGER_LIMIT = 200;
const DEBOUNCE_MS = 140;
const RECONCILE_MS = 30_000;
const JOINING_MS = 4_000;

export class FleetBridge {
  constructor({ adapter, broker, debounceMs = DEBOUNCE_MS, reconcileMs = RECONCILE_MS, joiningMs = JOINING_MS, ledgerLimit = LEDGER_LIMIT } = {}) {
    this.adapter = adapter;
    this.broker = broker;
    this.debounceMs = boundedInteger(debounceMs, DEBOUNCE_MS, 20, 2_000);
    this.reconcileMs = boundedInteger(reconcileMs, RECONCILE_MS, 1_000, 300_000);
    this.joiningMs = boundedInteger(joiningMs, JOINING_MS, 0, 30_000);
    this.ledgerLimit = boundedInteger(ledgerLimit, LEDGER_LIMIT, 1, LEDGER_LIMIT);
    this.startedAt = new Date().toISOString();
    this.tasks = new Map();
    this.plans = [];
    this.ledger = [];
    this.historyByTask = new Map();
    this.watchers = [];
    this.debounceTimer = null;
    this.reconcileTimer = null;
    this.joinTimer = null;
    this.pendingReasons = new Set();
    this.pendingIds = new Set();
    this.reconciling = false;
    this.rerunRequested = false;
    this.hasReconciled = false;
    this.closed = false;
    this.abortController = new AbortController();
    this.phase = "loading";
    this.error = null;
    this.lastReconciledAt = null;
    this.truncated = false;
  }

  async start() {
    if (this.closed) return;
    if (!this.adapter.available) {
      this.phase = "unavailable";
      this.error = this.adapter.error;
      this.broker.publish("fleet.snapshot", this.snapshot());
      return;
    }

    await this.reconcile("initial");
    if (this.closed) return;
    this.#startWatchers();
    this.reconcileTimer = setInterval(() => this.schedule("periodic"), this.reconcileMs);
    this.reconcileTimer.unref?.();
  }

  schedule(reason = "filesystem", filename = "") {
    if (this.closed) return;
    this.pendingReasons.add(reason);
    const id = idFromFilename(filename);
    if (id) this.pendingIds.add(id);
    else if (filename) this.pendingReasons.add("unknown-file-race");
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const reasons = [...this.pendingReasons];
      const ids = [...this.pendingIds];
      this.pendingReasons.clear();
      this.pendingIds.clear();
      this.reconcile(reasons.includes("periodic") || reasons.includes("unknown-file-race") ? "full" : reasons.join(",") || "filesystem", ids);
    }, this.debounceMs);
    this.debounceTimer.unref?.();
  }

  async reconcile(reason = "manual", changedIds = []) {
    if (this.closed) return;
    if (this.reconciling) {
      this.rerunRequested = true;
      for (const id of changedIds) this.pendingIds.add(id);
      return;
    }
    this.reconciling = true;
    try {
      const inventory = await this.adapter.readInventory();
      if (this.closed) return;
      this.error = inventory.error;
      this.truncated = inventory.truncated;
      this.plans = inventory.backlog;
      const nextIds = new Set(inventory.tasks.map((task) => task.id));
      const previousIds = new Set(this.tasks.keys());
      const newIds = inventory.tasks.filter((task) => !previousIds.has(task.id)).map((task) => task.id);
      const removedIds = [...previousIds].filter((id) => !nextIds.has(id));
      const isInitial = !this.hasReconciled;

      for (const baseTask of inventory.tasks) {
        const previous = this.tasks.get(baseTask.id);
        if (previous) {
          this.tasks.set(baseTask.id, { ...previous, ...baseTask, state: previous.state, stateLabel: previous.stateLabel, stateSource: previous.stateSource, detail: previous.detail, observedAt: previous.observedAt });
        } else {
          const joiningUntil = isInitial ? 0 : Date.now() + this.joiningMs;
          const task = { ...baseTask, joiningUntil, newAgent: !isInitial, firstSeenAfterBridgeStart: !isInitial };
          this.tasks.set(task.id, task);
          if (!isInitial) {
            this.#appendLifecycle({
              type: "task.spawned",
              taskId: task.id,
              source: task.agentName,
              label: "Agent joining",
              message: `${task.agentName} joined ${task.workstream}.`,
              state: "joining",
            }, task);
          }
        }
      }

      for (const id of removedIds) {
        const task = this.tasks.get(id);
        this.tasks.delete(id);
        this.historyByTask.delete(id);
        this.#appendLifecycle({
          type: "task.removed",
          taskId: id,
          source: task?.agentName ?? id.toUpperCase(),
          label: "Agent unavailable",
          message: `${task?.agentName ?? id.toUpperCase()} left the local fleet inventory.`,
          state: "unavailable",
        }, task);
      }

      this.#mergeHistory(inventory.histories, isInitial);
      this.hasReconciled = true;

      const fullReconcile = isInitial || reason === "full" || reason === "manual" || reason === "periodic";
      const requested = new Set(changedIds.filter((id) => this.tasks.has(id)));
      for (const id of newIds) requested.add(id);
      const reconcileTasks = fullReconcile
        ? [...this.tasks.values()]
        : [...requested].map((id) => this.tasks.get(id)).filter(Boolean);

      if (reconcileTasks.length > 0) {
        const states = await this.adapter.reconcileTasks(reconcileTasks, this.abortController.signal);
        if (this.closed) return;
        for (const task of reconcileTasks) {
          const nextState = states.get(task.id);
          if (!nextState) continue;
          const previous = this.tasks.get(task.id);
          const changed = previous.state !== nextState.state || previous.detail !== nextState.detail || previous.stateSource !== nextState.stateSource;
          const updated = { ...previous, ...nextState };
          this.tasks.set(task.id, updated);
          if (changed && !isInitial && !newIds.includes(task.id)) {
            this.#appendLifecycle({
              type: "task.updated",
              taskId: task.id,
              source: task.agentName,
              label: nextState.stateLabel,
              message: nextState.detail,
              state: nextState.state,
            }, updated);
          }
        }
      }

      this.lastReconciledAt = new Date().toISOString();
      this.phase = this.tasks.size === 0 && this.plans.length === 0 ? "empty" : "ready";
      this.broker.publish("fleet.snapshot", this.snapshot());
      this.#scheduleJoinTransition();
    } catch (error) {
      if (this.closed) return;
      this.phase = "error";
      this.error = sanitizeText(error?.message || "Fleet reconciliation failed.", 180);
      this.broker.publish("bridge.error", { message: this.error });
      this.broker.publish("fleet.snapshot", this.snapshot());
    } finally {
      this.reconciling = false;
      if (this.rerunRequested && !this.closed) {
        this.rerunRequested = false;
        const ids = [...this.pendingIds];
        this.pendingIds.clear();
        queueMicrotask(() => this.reconcile("full", ids));
      }
    }
  }

  snapshot() {
    const now = Date.now();
    const tasks = [...this.tasks.values()]
      .map((task) => publicTask(task, now))
      .sort((left, right) => left.id.localeCompare(right.id));
    const counts = {
      agents: tasks.length,
      working: tasks.filter((task) => task.state === "working").length,
      joining: tasks.filter((task) => task.displayState === "joining").length,
      waiting: tasks.filter((task) => task.state === "waiting").length,
      attention: tasks.filter((task) => ["attention", "blocked"].includes(task.state)).length,
      completed: tasks.filter((task) => task.state === "completed").length,
      unavailable: tasks.filter((task) => task.state === "unavailable").length,
      queued: this.plans.filter((plan) => plan.state === "queued" && !this.tasks.has(plan.id)).length,
    };
    return {
      schema: "ai-company-dashboard.v1",
      phase: this.phase,
      error: this.error,
      resolutionHint: this.adapter.available ? null : "Set FM_HOME to the operational home and FM_ROOT_OVERRIDE to the tracked Firstmate code root when it differs.",
      integration: {
        available: this.adapter.available,
        source: this.adapter.source,
        homeId: this.adapter.homeId,
        currentStateAuthority: "fm-crew-state.sh",
        statusFilesAre: "event history",
      },
      startedAt: this.startedAt,
      reconciledAt: this.lastReconciledAt,
      tasks,
      plans: this.plans.map(publicPlan),
      counts,
      ledger: this.ledger.slice(-this.ledgerLimit).reverse(),
      bounds: {
        browserEvents: 200,
        serverEvents: this.broker.retention,
        tasks: this.adapter.maxTasks,
        ledger: this.ledgerLimit,
        truncated: this.truncated,
      },
      runtime: {
        rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        transport: "SSE",
        radarFpsCap: 12,
        readOnly: true,
      },
    };
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.abortController.abort();
    clearTimeout(this.debounceTimer);
    clearTimeout(this.joinTimer);
    clearInterval(this.reconcileTimer);
    for (const watcher of this.watchers) {
      try { watcher.close(); } catch {}
    }
    this.watchers = [];
    this.adapter.close();
  }

  #startWatchers() {
    const onState = (_eventType, filename) => this.schedule("state-watch", String(filename ?? ""));
    const onData = (_eventType, filename) => {
      if (!filename || String(filename) === "backlog.md") this.schedule("backlog-watch", String(filename ?? ""));
    };
    try {
      const stateWatcher = watch(this.adapter.stateDir, { persistent: false }, onState);
      stateWatcher.on("error", () => this.schedule("unknown-file-race"));
      this.watchers.push(stateWatcher);
    } catch {
      this.error = "The Firstmate state directory could not be watched; periodic reconciliation remains active.";
    }
    try {
      const dataWatcher = watch(this.adapter.dataDir, { persistent: false }, onData);
      dataWatcher.on("error", () => this.schedule("unknown-file-race"));
      this.watchers.push(dataWatcher);
    } catch {
      this.error = "The Firstmate data directory could not be watched; periodic reconciliation remains active.";
    }
  }

  #mergeHistory(nextHistories, initial) {
    if (initial) {
      const imported = [...nextHistories.values()]
        .flat()
        .sort((left, right) => String(left.observedAt).localeCompare(String(right.observedAt)) || left.key.localeCompare(right.key))
        .slice(-this.ledgerLimit);
      for (const event of imported) this.#appendLedger({ ...event, type: "history.event" }, false);
      this.historyByTask = new Map([...nextHistories].map(([id, events]) => [id, events]));
      return;
    }

    for (const [id, next] of nextHistories) {
      const previous = this.historyByTask.get(id) ?? [];
      const additions = appendedHistory(previous, next);
      for (const event of additions) this.#appendLedger({ ...event, type: "history.event" }, true);
      this.historyByTask.set(id, next);
    }
  }

  #appendLifecycle(event, task) {
    const createdAt = new Date().toISOString();
    const ledgerEvent = {
      ...event,
      key: `${event.type}:${event.taskId}:${createdAt}`,
      workstream: task?.workstream ?? "Unassigned",
      createdAt,
      observedAt: createdAt,
      historical: false,
    };
    this.#appendLedger(ledgerEvent, false);
    const publicPayload = { event: ledgerEvent, task: task ? publicTask(task, Date.now()) : null };
    this.broker.publish(event.type, publicPayload, createdAt);
  }

  #appendLedger(event, publish) {
    const normalized = {
      key: sanitizeText(event.key || `${event.type}:${Date.now()}`, 180),
      type: event.type,
      taskId: safeId(event.taskId) ?? null,
      source: sanitizeText(event.source || "LOCAL", 72),
      label: sanitizeText(event.label || "Fleet event", 72),
      message: sanitizeText(event.message || "Fleet state changed.", 200),
      state: sanitizeText(event.state || event.verb || "history", 32),
      workstream: sanitizeText(event.workstream || this.tasks.get(event.taskId)?.workstream || "Unassigned", 72),
      observedAt: event.observedAt || event.createdAt || new Date().toISOString(),
      createdAt: event.createdAt || new Date().toISOString(),
      historical: Boolean(event.historical),
    };
    this.ledger.push(normalized);
    if (this.ledger.length > this.ledgerLimit) this.ledger.splice(0, this.ledger.length - this.ledgerLimit);
    if (publish) this.broker.publish(event.type || "history.event", { event: normalized }, normalized.createdAt);
  }

  #scheduleJoinTransition() {
    clearTimeout(this.joinTimer);
    const now = Date.now();
    const next = [...this.tasks.values()]
      .map((task) => task.joiningUntil || 0)
      .filter((until) => until > now)
      .sort((left, right) => left - right)[0];
    if (!next) return;
    this.joinTimer = setTimeout(() => {
      const transitionNow = Date.now();
      let changed = false;
      for (const [id, task] of this.tasks) {
        if (task.joiningUntil && task.joiningUntil <= transitionNow) {
          this.tasks.set(id, { ...task, joiningUntil: 0 });
          this.broker.publish("task.updated", { task: publicTask({ ...task, joiningUntil: 0 }, transitionNow), transition: "joining-complete" });
          changed = true;
        }
      }
      if (changed) this.broker.publish("fleet.snapshot", this.snapshot());
      this.#scheduleJoinTransition();
    }, Math.max(0, next - now));
    this.joinTimer.unref?.();
  }
}

function publicTask(task, now) {
  const displayState = task.joiningUntil > now ? "joining" : task.state;
  const displayStateLabel = displayState === "joining" ? "Joining" : task.stateLabel;
  return {
    id: task.id,
    agentName: task.agentName,
    title: task.title,
    workstream: task.workstream,
    role: task.role,
    kind: task.kind,
    firstSeenAt: task.firstSeenAt,
    state: task.state,
    stateLabel: task.stateLabel,
    stateSource: task.stateSource,
    detail: task.detail,
    observedAt: task.observedAt,
    displayState,
    displayStateLabel,
    newAgent: Boolean(task.newAgent),
  };
}

function publicPlan(plan) {
  return {
    id: plan.id,
    title: plan.title,
    workstream: plan.workstream,
    kind: plan.kind,
    state: plan.state,
    blockedBy: plan.blockedBy,
  };
}

function appendedHistory(previous, next) {
  if (next.length === 0) return [];
  if (sameEvents(previous, next)) return [];
  if (previous.length >= next.length && sameEvents(previous.slice(0, next.length), next)) return [];
  for (let overlap = Math.min(previous.length, next.length); overlap > 0; overlap -= 1) {
    if (sameEvents(previous.slice(-overlap), next.slice(0, overlap))) return next.slice(overlap);
  }
  return next.slice(-Math.min(next.length, 10));
}

function sameEvents(left, right) {
  return left.length === right.length && left.every((event, index) => event.key === right[index]?.key);
}

function idFromFilename(filename) {
  const name = path.basename(String(filename ?? ""));
  for (const suffix of [".meta", ".status"]) {
    if (name.endsWith(suffix)) return safeId(name.slice(0, -suffix.length));
  }
  return null;
}
