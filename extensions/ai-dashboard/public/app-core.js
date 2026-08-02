export const BROWSER_EVENT_LIMIT = 200;

export const STATE_LABELS = Object.freeze({
  joining: "Joining",
  working: "Working",
  waiting: "Waiting on external dependency",
  attention: "Attention needed",
  blocked: "Blocked",
  completed: "Completed",
  unavailable: "Unavailable",
  queued: "Queued",
});

export const FAILED_PHASES = Object.freeze(["error", "unavailable"]);

export const DEFAULT_LEDGER_EMPTY = Object.freeze({
  title: "No fleet events yet",
  description: "New joins, reconciled state transitions, and bounded status history will appear here.",
});

export function stateLabel(state, fallback = "Unavailable") {
  return STATE_LABELS[state] ?? fallback;
}

export function bridgeFailedFor(phase) {
  return FAILED_PHASES.includes(phase);
}

export function connectionReadout({ transport = "connecting", bridgeFailed = false } = {}) {
  if (transport === "connecting") return { state: "connecting", label: "Connecting" };
  if (transport !== "live") return { state: "reconnecting", label: "Reconnecting" };
  if (bridgeFailed) return { state: "error", label: "Bridge error" };
  return { state: "live", label: "Live / SSE" };
}

export function ledgerEmptyCopy({ phase, hint } = {}) {
  if (!bridgeFailedFor(phase)) return DEFAULT_LEDGER_EMPTY;
  return { title: "Event ledger unavailable", description: hint || DEFAULT_LEDGER_EMPTY.description };
}

export function flowColumnFor(item) {
  if (item.entityType === "plan" && item.state === "queued") return "queued";
  const state = item.displayState ?? item.state;
  if (state === "joining" || state === "working") return "active";
  if (["attention", "blocked", "waiting", "unavailable"].includes(state)) return "attention";
  if (state === "completed" || item.state === "done") return "verified";
  return "queued";
}

export function filterFleet(items, { filter = "all", query = "", acknowledged = new Set() } = {}) {
  const needle = String(query).trim().toLocaleLowerCase();
  return items.filter((item) => {
    const state = item.displayState ?? item.state;
    const isNew = Boolean(item.newAgent && !acknowledged.has(ackKey(item)));
    const filterMatch = filter === "all"
      || (filter === "attention" && ["attention", "blocked", "waiting", "unavailable"].includes(state))
      || (filter === "new" && isNew)
      || (filter === "completed" && (state === "completed" || state === "done"));
    if (!filterMatch) return false;
    if (!needle) return true;
    return [item.agentName, item.title, item.workstream, item.role, item.id]
      .some((value) => String(value ?? "").toLocaleLowerCase().includes(needle));
  });
}

export function appendBoundedEvent(events, event, limit = BROWSER_EVENT_LIMIT) {
  const next = [event, ...events.filter((existing) => eventIdentity(existing) !== eventIdentity(event))];
  return next.slice(0, Math.max(1, Math.min(BROWSER_EVENT_LIMIT, limit)));
}

export function ackKey(task) {
  return `${task.id}:${task.firstSeenAt ?? "unknown"}`;
}

export function topologyLayout(tasks, { width = 760, height = 520, maxAgents = 32, maxWorkstreams = 8 } = {}) {
  const visible = tasks.slice(0, maxAgents);
  const groups = new Map();
  for (const task of visible) {
    const key = task.workstream || "Unassigned";
    if (!groups.has(key) && groups.size >= maxWorkstreams) {
      const overflow = "Other workstreams";
      if (!groups.has(overflow)) groups.set(overflow, []);
      groups.get(overflow).push(task);
    } else {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(task);
    }
  }

  const center = { x: width / 2, y: height / 2 };
  const groupEntries = [...groups.entries()];
  const hubRadius = Math.min(width, height) * 0.29;
  const hubs = [];
  const nodes = [];
  const routes = [];

  groupEntries.forEach(([name, agents], groupIndex) => {
    const angle = -Math.PI / 2 + (groupIndex * Math.PI * 2) / Math.max(1, groupEntries.length);
    const hub = {
      id: `hub-${groupIndex}`,
      name,
      x: center.x + Math.cos(angle) * hubRadius,
      y: center.y + Math.sin(angle) * hubRadius,
      count: agents.length,
    };
    hubs.push(hub);
    agents.forEach((task, agentIndex) => {
      const spread = agents.length === 1 ? 0 : (agentIndex - (agents.length - 1) / 2) * 0.42;
      const nodeAngle = angle + Math.PI + spread;
      const nodeRadius = 68 + (agentIndex % 2) * 22;
      const node = {
        task,
        x: clamp(hub.x + Math.cos(nodeAngle) * nodeRadius, 42, width - 42),
        y: clamp(hub.y + Math.sin(nodeAngle) * nodeRadius, 42, height - 42),
      };
      nodes.push(node);
      routes.push({ from: node, to: hub });
    });
  });

  return {
    width,
    height,
    center,
    hubs,
    nodes,
    routes,
    omittedAgents: Math.max(0, tasks.length - visible.length),
  };
}

export function shouldRunRadar({ staticMode, reducedMotion, hidden, mode }) {
  return !staticMode && !reducedMotion && !hidden && mode === "operations";
}

export function sourceLabel(source) {
  switch (source) {
    case "run-step": return "Authoritative run step";
    case "pane": return "Authoritative active endpoint";
    case "status-log": return "Reconciled fallback";
    case "none": return "No current-state source";
    default: return source || "No current-state source";
  }
}

function eventIdentity(event) {
  return event.key || `${event.type}:${event.taskId}:${event.createdAt}:${event.message}`;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
