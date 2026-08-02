import { constants as fsConstants } from "node:fs";
import { access, lstat, open, readdir, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { cleanBacklogTitle, humanizeId, projectLabel, safeId, sanitizeStateDetail, sanitizeText } from "./sanitize.js";

const MAX_TASKS = 128;
const MAX_META_BYTES = 64 * 1024;
const MAX_STATUS_BYTES = 64 * 1024;
const MAX_STATUS_LINES = 100;
const MAX_BACKLOG_BYTES = 256 * 1024;
const STATE_TIMEOUT_MS = 15_000;
const RECONCILE_CONCURRENCY = 4;

export async function resolveFirstmateIntegration(options = {}) {
  if (options.stateDir && options.dataDir && options.crewStateScript) {
    const home = await canonicalDirectory(options.fmHome ?? path.dirname(options.stateDir));
    const stateDir = await canonicalDirectory(options.stateDir);
    const dataDir = await canonicalDirectory(options.dataDir);
    const crewStateScript = await canonicalFile(options.crewStateScript);
    const codeRoot = path.dirname(path.dirname(crewStateScript));
    return availableResolution({ home, stateDir, dataDir, crewStateScript, codeRoot, source: options.source ?? "explicit" });
  }

  const env = options.env ?? process.env;
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const explicitHome = options.fmHome ?? env.FM_HOME;
  let homeCandidate = explicitHome;
  let source = explicitHome ? "FM_HOME" : "";

  if (!homeCandidate && (options.firstmateRoot ?? env.FM_ROOT_OVERRIDE)) {
    homeCandidate = options.firstmateRoot ?? env.FM_ROOT_OVERRIDE;
    source = "FM_ROOT_OVERRIDE";
  }
  if (!homeCandidate) {
    const discovered = await findAncestor(cwd, async (candidate) => (
      await isDirectory(path.join(candidate, "state")) && await isFile(path.join(candidate, "bin", "fm-crew-state.sh"))
    ));
    if (discovered) {
      homeCandidate = discovered;
      source = "cwd";
    }
  }

  if (!homeCandidate) {
    return unavailableResolution("Firstmate home is not configured. Set FM_HOME to the operational home before running /aidashboard.");
  }

  let home;
  try {
    home = await canonicalDirectory(homeCandidate);
  } catch {
    return unavailableResolution("FM_HOME does not resolve to a readable directory.");
  }

  const stateCandidate = options.stateDir ?? env.FM_STATE_OVERRIDE ?? path.join(home, "state");
  const dataCandidate = options.dataDir ?? env.FM_DATA_OVERRIDE ?? path.join(home, "data");
  let stateDir;
  let dataDir;
  try {
    stateDir = await canonicalDirectory(stateCandidate);
    dataDir = await canonicalDirectory(dataCandidate);
  } catch {
    return unavailableResolution("The selected Firstmate home must contain readable state and data directories.", home);
  }

  const rootCandidates = unique([
    options.firstmateRoot,
    env.FM_ROOT_OVERRIDE,
    home,
    ...(await ancestorCandidates(cwd)),
    await findOnPath("fm-crew-state.sh", env.PATH),
  ].filter(Boolean));

  let crewStateScript = null;
  let codeRoot = null;
  for (const candidate of rootCandidates) {
    const scriptCandidate = path.basename(candidate) === "fm-crew-state.sh"
      ? candidate
      : path.join(candidate, "bin", "fm-crew-state.sh");
    try {
      crewStateScript = await canonicalFile(scriptCandidate);
      codeRoot = path.dirname(path.dirname(crewStateScript));
      break;
    } catch {}
  }

  if (!crewStateScript) {
    return unavailableResolution("The authoritative fm-crew-state.sh reader was not found. Set FM_ROOT_OVERRIDE to the tracked Firstmate code root.", home);
  }

  return availableResolution({ home, stateDir, dataDir, crewStateScript, codeRoot, source });
}

export class FirstmateAdapter {
  constructor(resolution, options = {}) {
    this.resolution = resolution;
    this.available = resolution.available;
    this.home = resolution.home;
    this.stateDir = resolution.stateDir;
    this.dataDir = resolution.dataDir;
    this.codeRoot = resolution.codeRoot;
    this.crewStateScript = resolution.crewStateScript;
    this.homeId = resolution.homeId;
    this.source = resolution.source;
    this.error = resolution.error;
    this.maxTasks = boundedInteger(options.maxTasks, MAX_TASKS, 1, MAX_TASKS);
    this.maxMetaBytes = boundedInteger(options.maxMetaBytes, MAX_META_BYTES, 1024, MAX_META_BYTES);
    this.maxStatusBytes = boundedInteger(options.maxStatusBytes, MAX_STATUS_BYTES, 1024, MAX_STATUS_BYTES);
    this.maxStatusLines = boundedInteger(options.maxStatusLines, MAX_STATUS_LINES, 1, MAX_STATUS_LINES);
    this.maxBacklogBytes = boundedInteger(options.maxBacklogBytes, MAX_BACKLOG_BYTES, 4096, MAX_BACKLOG_BYTES);
    this.stateTimeoutMs = boundedInteger(options.stateTimeoutMs, STATE_TIMEOUT_MS, 100, 60_000);
    this.concurrency = boundedInteger(options.concurrency, RECONCILE_CONCURRENCY, 1, 8);
    this.children = new Set();
    this.closed = false;
  }

  async readInventory() {
    if (!this.available) {
      return { tasks: [], backlog: [], histories: new Map(), truncated: false, error: this.error };
    }

    const [backlog, metaEntries] = await Promise.all([this.readBacklog(), this.#listMetaFiles()]);
    const backlogById = new Map(backlog.map((record) => [record.id, record]));
    const tasks = [];
    const histories = new Map();

    for (const entry of metaEntries.records) {
      const id = entry.name.slice(0, -5);
      const metaPath = path.join(this.stateDir, entry.name);
      try {
        const [meta, fileStat, history] = await Promise.all([
          readKeyValueFile(metaPath, this.maxMetaBytes),
          stat(metaPath),
          this.readStatusHistory(id),
        ]);
        const planned = backlogById.get(id);
        const workstream = sanitizeText(planned?.repo || projectLabel(meta.project), 72) || "Unassigned";
        const firstSeenAt = new Date(validTimestamp(fileStat.birthtimeMs) ?? fileStat.ctimeMs ?? fileStat.mtimeMs).toISOString();
        tasks.push({
          id,
          agentName: id.toUpperCase(),
          title: planned?.title || humanizeId(id),
          workstream,
          role: roleLabel(meta.kind),
          kind: sanitizeText(meta.kind || "ship", 24),
          firstSeenAt,
          state: "unavailable",
          stateLabel: "Unavailable",
          stateSource: "none",
          detail: "Current state has not been reconciled yet.",
          observedAt: null,
        });
        histories.set(id, history);
      } catch {
        tasks.push({
          id,
          agentName: id.toUpperCase(),
          title: planned?.title || humanizeId(id),
          workstream: planned?.repo || "Unassigned",
          role: "Agent",
          kind: "unknown",
          firstSeenAt: new Date().toISOString(),
          state: "unavailable",
          stateLabel: "Unavailable",
          stateSource: "none",
          detail: "The local task record could not be read safely.",
          observedAt: new Date().toISOString(),
        });
        histories.set(id, []);
      }
    }

    return { tasks, backlog, histories, truncated: metaEntries.truncated, error: null };
  }

  async reconcileTasks(tasks, signal) {
    const results = new Map();
    let cursor = 0;
    const workerCount = Math.min(this.concurrency, tasks.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (!this.closed && !signal?.aborted) {
        const index = cursor++;
        if (index >= tasks.length) return;
        const task = tasks[index];
        results.set(task.id, await this.reconcileTask(task.id, signal));
      }
    });
    await Promise.all(workers);
    return results;
  }

  async reconcileTask(id, signal) {
    if (!this.available || !safeId(id)) return unavailableState("Authoritative state is unavailable.");
    if (this.closed || signal?.aborted) return unavailableState("State reconciliation was cancelled.");

    const childEnv = allowlistedEnvironment(process.env, {
      FM_HOME: this.home,
      FM_ROOT_OVERRIDE: this.codeRoot,
      FM_STATE_OVERRIDE: this.stateDir,
      FM_DATA_OVERRIDE: this.dataDir,
    });

    try {
      const output = await this.#runBounded(this.crewStateScript, [id], { cwd: this.codeRoot, env: childEnv, signal });
      return parseCrewState(output);
    } catch (error) {
      return unavailableState(error?.code === "ETIMEDOUT"
        ? "Authoritative state reconciliation timed out."
        : "Authoritative state reconciliation failed.");
    }
  }

  async readBacklog() {
    if (!this.available) return [];
    const backlogPath = path.join(this.dataDir, "backlog.md");
    let content;
    try {
      content = await readBoundedRegularFile(backlogPath, this.maxBacklogBytes, "head");
    } catch {
      return [];
    }
    return parseBacklog(content).slice(0, 256);
  }

  async readStatusHistory(id) {
    if (!safeId(id)) return [];
    const statusPath = path.join(this.stateDir, `${id}.status`);
    let content;
    try {
      content = await readBoundedRegularFile(statusPath, this.maxStatusBytes, "tail");
    } catch {
      return [];
    }
    const lines = content.split(/\r?\n/).filter((line) => line.trim()).slice(-this.maxStatusLines);
    let observedAt = new Date().toISOString();
    try { observedAt = (await stat(statusPath)).mtime.toISOString(); } catch {}
    return lines.map((line, index) => parseStatusLine(id, line, observedAt, index)).filter(Boolean);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const child of [...this.children]) terminateChild(child);
    this.children.clear();
  }

  async #listMetaFiles() {
    const entries = await readdir(this.stateDir, { withFileTypes: true });
    const records = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".meta") && safeId(entry.name.slice(0, -5)))
      .sort((left, right) => left.name.localeCompare(right.name));
    return { records: records.slice(0, this.maxTasks), truncated: records.length > this.maxTasks };
  }

  #runBounded(command, args, { cwd, env, signal }) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(Object.assign(new Error("Cancelled"), { code: "ABORT_ERR" }));
      const detached = process.platform !== "win32";
      const child = spawn(command, args, { cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"], detached });
      this.children.add(child);
      const chunks = [];
      let bytes = 0;
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        this.children.delete(child);
        callback(value);
      };
      const fail = (error) => {
        terminateChild(child);
        finish(reject, error);
      };
      const onAbort = () => fail(Object.assign(new Error("Cancelled"), { code: "ABORT_ERR" }));
      const timer = setTimeout(() => fail(Object.assign(new Error("Timed out"), { code: "ETIMEDOUT" })), this.stateTimeoutMs);
      timer.unref?.();
      signal?.addEventListener("abort", onAbort, { once: true });
      child.stdout.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 8192) return fail(Object.assign(new Error("Output exceeded bound"), { code: "EOVERFLOW" }));
        chunks.push(chunk);
      });
      child.stderr.resume();
      child.once("error", (error) => finish(reject, error));
      child.once("close", (code) => {
        if (code !== 0) return finish(reject, Object.assign(new Error(`Reader exited ${code}`), { code: "EREADER" }));
        finish(resolve, Buffer.concat(chunks).toString("utf8"));
      });
    });
  }
}

export function parseCrewState(output) {
  const line = String(output ?? "").split(/\r?\n/, 1)[0];
  const match = line.match(/^state:\s*([^·]+?)\s*·\s*source:\s*([^·]+?)(?:\s*·\s*(.*))?$/);
  if (!match) return unavailableState("The authoritative state response was not recognized.");
  const rawState = match[1].trim();
  const source = sanitizeText(match[2], 32) || "none";
  const detail = sanitizeStateDetail(match[3] || "No additional state detail.");
  const mapped = mapCrewState(rawState);
  return {
    state: mapped.state,
    stateLabel: mapped.label,
    stateSource: source,
    detail,
    observedAt: new Date().toISOString(),
  };
}

export function parseBacklog(content) {
  const records = [];
  let section = null;
  for (const rawLine of String(content ?? "").split(/\r?\n/)) {
    const heading = rawLine.match(/^##\s+(In flight|Queued|Done)\s*$/i);
    if (heading) {
      section = heading[1].toLowerCase() === "in flight" ? "in_flight" : heading[1].toLowerCase();
      continue;
    }
    if (!section) continue;
    const match = rawLine.match(/^[-*]\s+(?:\[[ xX]\]\s+|\*\*)([A-Za-z0-9][A-Za-z0-9._-]{0,119})(?:\*\*)?\s+-\s+(.+)$/);
    if (!match) continue;
    const id = safeId(match[1]);
    const title = cleanBacklogTitle(match[2]);
    if (!id || !title) continue;
    const repo = sanitizeText(match[2].match(/\(repo:\s*([^),]+)\)/i)?.[1] || "", 72);
    const kind = sanitizeText(match[2].match(/\(kind:\s*([^),]+)\)/i)?.[1] || "", 24);
    const blockedBy = safeId(match[2].match(/blocked-by:\s*([^\s)]+)/i)?.[1]) || null;
    records.push({ id, title, workstream: repo || "Unassigned", repo: repo || "Unassigned", kind: kind || "task", state: section, blockedBy });
  }
  return records;
}

export function parseStatusLine(id, line, observedAt, ordinal = 0) {
  const match = String(line ?? "").match(/^([a-z][a-z-]*)(?:\s+\[key=([^\]]+)\])?:\s*(.*)$/i);
  if (!match) return null;
  const verb = match[1].toLowerCase();
  const note = sanitizeText(match[3], 200);
  if (!note) return null;
  return {
    key: `${id}:${ordinal}:${createHash("sha1").update(line).digest("hex").slice(0, 10)}`,
    taskId: id,
    source: id.toUpperCase(),
    verb,
    label: statusEventLabel(verb),
    message: note,
    observedAt,
    historical: true,
  };
}

function mapCrewState(rawState) {
  switch (rawState) {
    case "working": return { state: "working", label: "Working" };
    case "parked": return { state: "attention", label: "Attention needed" };
    case "blocked": return { state: "blocked", label: "Blocked" };
    case "paused": return { state: "waiting", label: "Waiting on external dependency" };
    case "done": return { state: "completed", label: "Completed" };
    case "failed": return { state: "unavailable", label: "Unavailable" };
    default: return { state: "unavailable", label: "Unavailable" };
  }
}

function statusEventLabel(verb) {
  switch (verb) {
    case "working": return "Working event";
    case "needs-decision": return "Decision requested";
    case "blocked": return "Blocked event";
    case "paused": return "External wait event";
    case "done": return "Completion event";
    case "failed": return "Failure event";
    case "resolved": return "Decision resolved";
    default: return "Status event";
  }
}

function roleLabel(kind) {
  switch (String(kind ?? "").toLowerCase()) {
    case "scout": return "Research agent";
    case "secondmate": return "Domain lead";
    case "ship": return "Delivery agent";
    default: return "Agent";
  }
}

function unavailableState(detail) {
  return { state: "unavailable", stateLabel: "Unavailable", stateSource: "none", detail, observedAt: new Date().toISOString() };
}

async function readKeyValueFile(filePath, maxBytes) {
  const content = await readBoundedRegularFile(filePath, maxBytes, "head");
  const allowed = new Set(["project", "kind"]);
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index);
    if (allowed.has(key)) result[key] = line.slice(index + 1);
  }
  return result;
}

async function readBoundedRegularFile(filePath, maxBytes, side) {
  const fileInfo = await lstat(filePath);
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) throw new Error("Not a regular file");
  const handle = await open(filePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const current = await handle.stat();
    if (!current.isFile()) throw new Error("Not a regular file");
    const length = Math.min(current.size, maxBytes);
    const offset = side === "tail" ? Math.max(0, current.size - length) : 0;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, offset);
    let text = buffer.toString("utf8");
    if (side === "tail" && offset > 0) text = text.replace(/^[^\n]*(?:\n|$)/, "");
    return text;
  } finally {
    await handle.close();
  }
}

function terminateChild(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch {}
}

function allowlistedEnvironment(env, overrides) {
  const keys = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL", "TERM", "TMUX", "TMUX_PANE", "HERDR_ENV", "HERDR_SESSION", "HERDR_PANE_ID", "NO_COLOR"];
  const result = {};
  for (const key of keys) if (env[key]) result[key] = env[key];
  return { ...result, ...overrides };
}

function availableResolution({ home, stateDir, dataDir, crewStateScript, codeRoot, source }) {
  return {
    available: true,
    home,
    stateDir,
    dataDir,
    crewStateScript,
    codeRoot,
    source,
    homeId: createHash("sha256").update(home).digest("hex").slice(0, 16),
    error: null,
  };
}

function unavailableResolution(error, home = "") {
  return {
    available: false,
    home,
    stateDir: null,
    dataDir: null,
    crewStateScript: null,
    codeRoot: null,
    source: "unavailable",
    homeId: home ? createHash("sha256").update(home).digest("hex").slice(0, 16) : "unconfigured",
    error,
  };
}

async function canonicalDirectory(candidate) {
  const resolved = await realpath(path.resolve(String(candidate)));
  const info = await stat(resolved);
  if (!info.isDirectory()) throw new Error("Not a directory");
  return resolved;
}

async function canonicalFile(candidate) {
  const resolved = await realpath(path.resolve(String(candidate)));
  const info = await stat(resolved);
  if (!info.isFile()) throw new Error("Not a file");
  await access(resolved, fsConstants.R_OK | fsConstants.X_OK);
  return resolved;
}

async function isDirectory(candidate) {
  try { return (await stat(candidate)).isDirectory(); } catch { return false; }
}

async function isFile(candidate) {
  try { return (await stat(candidate)).isFile(); } catch { return false; }
}

async function findAncestor(start, predicate) {
  let current = path.resolve(start);
  for (let depth = 0; depth < 12; depth += 1) {
    if (await predicate(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

async function ancestorCandidates(start) {
  const candidates = [];
  let current = path.resolve(start);
  for (let depth = 0; depth < 12; depth += 1) {
    if (await isFile(path.join(current, "bin", "fm-crew-state.sh"))) candidates.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return candidates;
}

async function findOnPath(executable, pathValue) {
  for (const directory of String(pathValue ?? "").split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, executable);
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}

function unique(values) {
  return [...new Set(values.map((value) => path.resolve(String(value))))];
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function validTimestamp(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}
