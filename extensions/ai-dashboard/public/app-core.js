export const BROWSER_EVENT_LIMIT = 200;

const NODE_MIN_WIDTH = 118;
const NODE_MIN_HEIGHT = 62;
const NODE_GUTTER = 8;
const BOARD_MARGIN = 14;
const HUB_LABEL_CHAR_WIDTH = 6.6;

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

export const STREAM_CLOSED_COPY = Object.freeze({
  title: "Live updates stopped",
  description: "The local dashboard stream was refused or closed and will not retry. Close another dashboard tab, then reload this page.",
});

export function stateLabel(state, fallback = "Unavailable") {
  return STATE_LABELS[state] ?? fallback;
}

export function bridgeFailedFor(phase) {
  return FAILED_PHASES.includes(phase);
}

export function connectionReadout({ transport = "connecting", bridgeFailed = false } = {}) {
  if (transport === "closed") return { state: "closed", label: "Stream closed" };
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
  const boardWidth = Math.max(NODE_MIN_WIDTH + BOARD_MARGIN * 2, Math.round(Number(width) || 0));
  const boardHeight = Math.max(NODE_MIN_HEIGHT + BOARD_MARGIN * 2, Math.round(Number(height) || 0));
  const usableWidth = boardWidth - BOARD_MARGIN * 2;
  const usableHeight = boardHeight - BOARD_MARGIN * 2;
  const columns = Math.max(1, Math.floor(usableWidth / (NODE_MIN_WIDTH + NODE_GUTTER)));
  const rows = Math.max(1, Math.floor(usableHeight / (NODE_MIN_HEIGHT + NODE_GUTTER)));
  const cellWidth = usableWidth / columns;
  const cellHeight = usableHeight / rows;
  const nodeWidth = cellWidth - NODE_GUTTER;
  const nodeHeight = cellHeight - NODE_GUTTER;

  const visible = tasks.slice(0, Math.min(maxAgents, columns * rows));
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

  const center = { x: boardWidth / 2, y: boardHeight / 2 };
  const groupEntries = [...groups.entries()];
  const hubRadius = Math.min(boardWidth, boardHeight) * 0.29;
  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push({
        x: BOARD_MARGIN + (column + 0.5) * cellWidth,
        y: BOARD_MARGIN + (row + 0.5) * cellHeight,
        taken: false,
        reserved: false,
      });
    }
  }

  const hubs = groupEntries.map(([name, agents], groupIndex) => {
    const angle = -Math.PI / 2 + (groupIndex * Math.PI * 2) / Math.max(1, groupEntries.length);
    return {
      id: `hub-${groupIndex}`,
      name,
      label: hubLabel(name, hubRadius, groupEntries.length),
      angle,
      x: center.x + Math.cos(angle) * hubRadius,
      y: center.y + Math.sin(angle) * hubRadius,
      count: agents.length,
    };
  });
  for (const hub of hubs) {
    const cell = nearestCell(cells, hub);
    if (cell) cell.reserved = true;
  }

  const nodes = [];
  const routes = [];
  const fanRadius = Math.min(boardWidth, boardHeight) * 0.13;
  groupEntries.forEach(([, agents], groupIndex) => {
    const hub = hubs[groupIndex];
    agents.forEach((task, agentIndex) => {
      const spread = agents.length === 1 ? 0 : (agentIndex - (agents.length - 1) / 2) * 0.42;
      const nodeAngle = hub.angle + Math.PI + spread;
      const reach = fanRadius + (agentIndex % 2) * cellHeight * 0.5;
      const ideal = {
        x: clamp(hub.x + Math.cos(nodeAngle) * reach, BOARD_MARGIN, boardWidth - BOARD_MARGIN),
        y: clamp(hub.y + Math.sin(nodeAngle) * reach, BOARD_MARGIN, boardHeight - BOARD_MARGIN),
      };
      const cell = nearestCell(cells, ideal, { free: true });
      if (!cell) return;
      cell.taken = true;
      const node = { task, x: cell.x, y: cell.y, width: nodeWidth, height: nodeHeight };
      nodes.push(node);
      routes.push({ from: node, to: hub });
    });
  });

  return {
    width: boardWidth,
    height: boardHeight,
    center,
    hubs,
    nodes,
    routes,
    columns,
    rows,
    cellWidth,
    cellHeight,
    nodeWidth,
    nodeHeight,
    omittedAgents: Math.max(0, tasks.length - nodes.length),
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

function hubLabel(name, hubRadius, hubCount) {
  const text = String(name ?? "Unassigned").toLocaleUpperCase();
  const arc = hubCount > 1 ? 2 * hubRadius * Math.sin(Math.PI / hubCount) : Number.POSITIVE_INFINITY;
  const maxChars = Math.max(6, Math.min(24, Math.floor(arc / HUB_LABEL_CHAR_WIDTH)));
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text;
}

function nearestCell(cells, target, { free = false } = {}) {
  const reservePenalty = Number.MAX_SAFE_INTEGER / 4;
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const cell of cells) {
    if (free && cell.taken) continue;
    const score = (cell.x - target.x) ** 2 + (cell.y - target.y) ** 2 + (free && cell.reserved ? reservePenalty : 0);
    if (score < bestScore) {
      bestScore = score;
      best = cell;
    }
  }
  return best;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
