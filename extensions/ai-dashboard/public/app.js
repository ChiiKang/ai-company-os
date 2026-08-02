import {
  BROWSER_EVENT_LIMIT,
  ackKey,
  appendBoundedEvent,
  filterFleet,
  flowColumnFor,
  shouldRunRadar,
  sourceLabel,
  stateLabel,
  topologyLayout,
} from "/assets/app-core.js";

const model = {
  mode: "flowline",
  filter: "all",
  query: "",
  snapshot: null,
  tasks: new Map(),
  plans: [],
  events: [],
  selectedId: null,
  connection: "connecting",
  acknowledged: loadAcknowledgements(),
  staticMode: loadMotionPreference(),
};

const elements = {
  body: document.body,
  modeHeading: document.getElementById("mode-heading"),
  connection: document.getElementById("connection-state"),
  motionToggle: document.getElementById("motion-toggle"),
  motionReadout: document.getElementById("motion-readout"),
  tabs: [...document.querySelectorAll('[role="tab"][data-mode]')],
  panels: [...document.querySelectorAll('[role="tabpanel"]')],
  search: document.getElementById("fleet-search"),
  filters: [...document.querySelectorAll("[data-filter]")],
  ackAll: document.getElementById("acknowledge-all"),
  newCount: document.getElementById("new-count"),
  flowline: document.getElementById("flowline-board"),
  roster: document.getElementById("agent-roster"),
  rosterCount: document.getElementById("roster-count"),
  topology: document.getElementById("topology"),
  topologySvg: document.getElementById("topology-svg"),
  topologyNodes: document.getElementById("topology-nodes"),
  topologyEmpty: document.getElementById("topology-empty"),
  topologyReadout: document.getElementById("topology-readout"),
  eventBody: document.getElementById("event-body"),
  ledgerEmpty: document.getElementById("ledger-empty"),
  ledgerBound: document.getElementById("ledger-bound"),
  inspector: document.getElementById("inspector-body"),
  bridgeDetail: document.getElementById("bridge-detail"),
  lastReconciled: document.getElementById("last-reconciled"),
  metrics: {
    agents: document.getElementById("metric-agents"),
    working: document.getElementById("metric-working"),
    attention: document.getElementById("metric-attention"),
    queued: document.getElementById("metric-queued"),
    events: document.getElementById("metric-events"),
    memory: document.getElementById("metric-memory"),
  },
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let source;
let radarFrame = null;
let radarAngle = 0;
let radarLastFrame = 0;

setupInteractions();
applyMotionMode();
connectStream();

function connectStream() {
  setConnection("connecting", "Connecting");
  source = new EventSource("/events");
  source.onopen = () => setConnection("live", "Live / SSE");
  source.onerror = () => setConnection("reconnecting", "Reconnecting");
  source.onmessage = (message) => {
    let event;
    try { event = JSON.parse(message.data); } catch { return; }
    handleFleetEvent(event);
  };
}

function handleFleetEvent(event) {
  if (event.type === "fleet.snapshot" || event.type === "stream.reset") {
    applySnapshot(event.payload);
    return;
  }
  if (event.type === "bridge.error") {
    setConnection("error", "Bridge error");
    model.events = appendBoundedEvent(model.events, eventToLedger(event));
    render();
    return;
  }

  const task = event.payload?.task;
  if (task) {
    if (event.type === "task.removed") model.tasks.delete(task.id);
    else model.tasks.set(task.id, task);
  } else if (event.type === "task.removed" && event.payload?.event?.taskId) {
    model.tasks.delete(event.payload.event.taskId);
  }
  if (event.payload?.event) model.events = appendBoundedEvent(model.events, event.payload.event);
  render();
}

function applySnapshot(snapshot) {
  model.snapshot = snapshot;
  model.tasks = new Map((snapshot?.tasks ?? []).map((task) => [task.id, task]));
  model.plans = snapshot?.plans ?? [];
  model.events = (snapshot?.ledger ?? []).slice(0, BROWSER_EVENT_LIMIT);
  if (model.selectedId && !model.tasks.has(model.selectedId) && !model.plans.some((plan) => plan.id === model.selectedId)) model.selectedId = null;
  if (!model.selectedId) model.selectedId = firstSelectableId();
  render();
}

function render() {
  renderMetrics();
  renderAcknowledgements();
  renderModeState();
  renderInspector();
  updateSystemFooter();
  updateRadarState();
}

function renderModeState() {
  const phase = model.snapshot?.phase ?? "loading";
  if (phase === "loading") {
    renderLoading();
    return;
  }
  if (["unavailable", "error"].includes(phase)) {
    renderFailure();
    return;
  }
  if (model.mode === "flowline") renderFlowline();
  else if (model.mode === "operations") renderOperations();
  else renderLedger();
}

function renderLoading() {
  elements.flowline.replaceChildren(stateMessage("Loading local fleet plan", "Waiting for the first bounded reconciliation.", "loading-state"));
  elements.roster.replaceChildren(stateMessage("Loading agent roster", "Current state is being reconciled.", "state-message compact"));
  elements.topologyEmpty.hidden = false;
  elements.topologyEmpty.textContent = "Loading local topology.";
  elements.eventBody.replaceChildren();
  elements.ledgerEmpty.hidden = false;
}

function renderFailure() {
  const message = model.snapshot?.error || "The local fleet bridge is unavailable.";
  const hint = model.snapshot?.resolutionHint || "Check the Firstmate home and authoritative reader configuration, then reload this page.";
  elements.flowline.replaceChildren(stateMessage(message, hint));
  elements.roster.replaceChildren(stateMessage("Agent roster unavailable", hint, "state-message compact"));
  elements.topologySvg.replaceChildren(svgTitle("Live fleet workstream topology"), svgDescription("Topology unavailable until the local bridge reconnects."));
  elements.topologyNodes.replaceChildren();
  elements.topologyEmpty.hidden = false;
  elements.topologyEmpty.textContent = "Topology unavailable.";
  elements.eventBody.replaceChildren();
  elements.ledgerEmpty.hidden = false;
  elements.ledgerEmpty.querySelector("strong").textContent = "Event ledger unavailable";
  elements.ledgerEmpty.querySelector("span").textContent = hint;
}

function renderFlowline() {
  const currentTasks = [...model.tasks.values()].map((task) => ({ ...task, entityType: "task" }));
  const taskIds = new Set(currentTasks.map((task) => task.id));
  const plans = model.plans
    .filter((plan) => !taskIds.has(plan.id))
    .map((plan) => ({ ...plan, entityType: "plan", agentName: "No agent assigned", role: "Planned work", displayState: plan.state === "done" ? "completed" : "queued" }));
  const items = filterFleet([...currentTasks, ...plans], filterOptions());
  const columns = [
    { id: "queued", index: "01", title: "Queued", description: "Planned, no live agent" },
    { id: "active", index: "02", title: "In motion", description: "Joining or working" },
    { id: "attention", index: "03", title: "Attention / external", description: "Blocked, waiting, unavailable" },
    { id: "verified", index: "04", title: "Verified", description: "Completed evidence" },
  ];

  if (items.length === 0) {
    const noFleet = model.tasks.size === 0 && model.plans.length === 0;
    elements.flowline.replaceChildren(stateMessage(
      noFleet ? "No local fleet records yet" : "No tasks match this filter",
      noFleet ? "Create or queue a Firstmate task. A new task record will join this dashboard without a reload." : "Clear the search or choose All to restore the whole-company plan.",
    ));
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const column of columns) {
    const section = el("section", "flow-column");
    const members = items.filter((item) => flowColumnFor(item) === column.id);
    const header = el("header");
    const titleWrap = el("div");
    titleWrap.append(el("span", "column-index", column.index), el("h2", "", column.title), el("small", "", column.description));
    header.append(titleWrap, el("b", "column-count", String(members.length).padStart(2, "0")));
    section.append(header);
    const list = el("div", "flow-list");
    if (members.length === 0) list.append(stateMessage("Nothing here", column.description, "column-empty"));
    for (const item of members) list.append(taskButton(item, "flow-card"));
    section.append(list);
    fragment.append(section);
  }
  elements.flowline.replaceChildren(fragment);
}

function renderOperations() {
  const tasks = filterFleet([...model.tasks.values()], filterOptions());
  elements.rosterCount.textContent = `${tasks.length} visible`;
  elements.roster.replaceChildren(...(tasks.length
    ? tasks.map((task) => taskButton(task, "agent-row"))
    : [stateMessage("No agents match", "Clear the filter to restore the whole-company roster.", "state-message compact")]));

  const layout = topologyLayout(tasks);
  elements.topologyReadout.textContent = `${layout.hubs.length} workstream${layout.hubs.length === 1 ? "" : "s"}${layout.omittedAgents ? ` / ${layout.omittedAgents} bounded` : ""}`;
  drawTopology(layout);
}

function drawTopology(layout) {
  const svg = elements.topologySvg;
  svg.replaceChildren(svgTitle("Live fleet workstream topology"), svgDescription("Agents connected to their actual project or workstream hubs."));
  drawRadarGeometry(svg, layout);
  elements.topologyNodes.replaceChildren();
  elements.topologyEmpty.hidden = layout.nodes.length > 0;
  elements.topologyEmpty.textContent = "No live agents are available for the topology.";

  for (const route of layout.routes) {
    const path = svgElement("path", {
      d: `M ${route.from.x.toFixed(1)} ${route.from.y.toFixed(1)} Q ${((route.from.x + route.to.x) / 2 + 10).toFixed(1)} ${((route.from.y + route.to.y) / 2 - 10).toFixed(1)} ${route.to.x.toFixed(1)} ${route.to.y.toFixed(1)}`,
      class: "route-line",
    });
    svg.append(path);
  }
  for (const hub of layout.hubs) {
    svg.append(svgElement("circle", { cx: hub.x, cy: hub.y, r: 18, class: "hub-ring" }));
    svg.append(svgText(hub.x, hub.y - 28, hub.name.toUpperCase(), "hub-label"));
    svg.append(svgText(hub.x, hub.y + 32, `${hub.count} AGENT${hub.count === 1 ? "" : "S"}`, "hub-meta"));
  }
  const sweep = svgElement("g", { id: "radar-sweep", class: "radar-sweep" });
  sweep.append(svgElement("line", { x1: layout.center.x, y1: layout.center.y, x2: layout.center.x, y2: 48, class: "sweep-line" }));
  sweep.append(svgElement("circle", { cx: layout.center.x, cy: 48, r: 2.5, class: "sweep-tip" }));
  svg.append(sweep);

  for (const node of layout.nodes) {
    const task = node.task;
    const button = el("button", `map-node state-${task.displayState}${isUnacknowledged(task) ? " new-agent" : ""}${model.selectedId === task.id ? " selected" : ""}`);
    button.type = "button";
    button.dataset.taskId = task.id;
    button.style.setProperty("--node-x", `${(node.x / layout.width) * 100}%`);
    button.style.setProperty("--node-y", `${(node.y / layout.height) * 100}%`);
    const marker = el("i", "node-marker");
    marker.setAttribute("aria-hidden", "true");
    const copy = el("span");
    copy.append(el("b", "", task.agentName), el("small", "", task.displayStateLabel || stateLabel(task.displayState)));
    if (isUnacknowledged(task)) copy.append(el("em", "new-label", "NEW"));
    button.append(marker, copy);
    button.addEventListener("click", () => selectItem(task.id));
    elements.topologyNodes.append(button);
  }
}

function drawRadarGeometry(svg, layout) {
  const { x, y } = layout.center;
  for (const radius of [58, 118, 178, 232]) svg.append(svgElement("circle", { cx: x, cy: y, r: radius, class: "radar-ring" }));
  svg.append(svgElement("line", { x1: x, y1: 28, x2: x, y2: layout.height - 28, class: "radar-axis" }));
  svg.append(svgElement("line", { x1: 48, y1: y, x2: layout.width - 48, y2: y, class: "radar-axis" }));
  svg.append(svgElement("line", { x1: 118, y1: 68, x2: layout.width - 118, y2: layout.height - 68, class: "radar-axis faint" }));
  svg.append(svgElement("line", { x1: layout.width - 118, y1: 68, x2: 118, y2: layout.height - 68, class: "radar-axis faint" }));
  svg.append(svgText(28, 34, "LOCAL FLOW MAP / LIVE", "axis-label start"));
  svg.append(svgText(layout.width - 28, layout.height - 24, `${layout.nodes.length} NODES / ${layout.hubs.length} HUBS`, "axis-label end"));
}

function renderLedger() {
  const events = model.events.filter((event) => eventMatchesFilter(event));
  elements.ledgerBound.textContent = `${model.events.length} of ${BROWSER_EVENT_LIMIT} browser records`;
  elements.ledgerEmpty.hidden = events.length > 0;
  const rows = events.map((event) => {
    const row = document.createElement("tr");
    row.append(
      cell(formatObserved(event.observedAt || event.createdAt), "time", "Observed"),
      cell(event.source || event.taskId || "LOCAL", "", "Source"),
      cell(event.label || stateLabel(event.state), `event-state state-text-${event.state || "history"}`, "Classification"),
      cell(event.message || "Fleet state changed.", "", "Event"),
      cell(event.workstream || "Unassigned", "", "Workstream"),
      cell(event.historical ? "Event history" : "Live observation", event.historical ? "history-evidence" : "live-evidence", "Evidence"),
    );
    return row;
  });
  elements.eventBody.replaceChildren(...rows);
}

function renderInspector() {
  const task = model.tasks.get(model.selectedId);
  const plan = !task ? model.plans.find((item) => item.id === model.selectedId) : null;
  if (!task && !plan) {
    elements.inspector.replaceChildren(stateMessage("No agent selected", "Select an agent or task to inspect its assignment and reconciled state.", "state-message compact"));
    return;
  }

  if (plan) {
    const body = el("div", "inspector-content");
    body.append(inspectorIdentity(plan.id.toUpperCase(), plan.state === "done" ? "Completed" : "Queued", plan.state === "done" ? "completed" : "queued"));
    body.append(inspectorSection("Assignment", plan.title));
    body.append(inspectorDefinition([
      ["Workstream", plan.workstream],
      ["Agent", "Not assigned"],
      ["Planning record", plan.state === "done" ? "Verified" : "Queued"],
      ["Dependency", plan.blockedBy || "None recorded"],
    ]));
    elements.inspector.replaceChildren(body);
    return;
  }

  const body = el("div", "inspector-content");
  body.append(inspectorIdentity(task.agentName, task.displayStateLabel || stateLabel(task.displayState), task.displayState));
  if (isUnacknowledged(task)) {
    const newBlock = el("section", "new-agent-block");
    newBlock.append(el("span", "eyebrow", "NEW AGENT / UNACKNOWLEDGED"), el("p", "", `${task.agentName} joined this dashboard at ${formatObserved(task.firstSeenAt)}.`));
    const ack = el("button", "ack-button", `Acknowledge ${task.agentName}`);
    ack.type = "button";
    ack.addEventListener("click", () => acknowledge(task));
    newBlock.append(ack);
    body.append(newBlock);
  }
  body.append(inspectorSection("Current assignment", task.title));
  if (task.displayState === "joining" && task.state !== "joining") {
    body.append(inspectorNote("Joining signal", `The new-agent transition is visible. Authoritative current truth is ${task.stateLabel}.`));
  }
  body.append(inspectorDefinition([
    ["Workstream", task.workstream],
    ["Role", task.role],
    ["Current truth", task.stateLabel],
    ["State source", sourceLabel(task.stateSource)],
    ["Observed", formatObserved(task.observedAt)],
  ]));
  body.append(inspectorNote("Reconciled detail", task.detail || "No additional state detail."));
  body.append(inspectorNote("Boundary", "This surface observes local fleet records only. No task, agent, or Firstmate state can be changed here."));
  elements.inspector.replaceChildren(body);
}

function renderMetrics() {
  const counts = model.snapshot?.counts ?? {};
  elements.metrics.agents.textContent = formatCount(counts.agents);
  elements.metrics.working.textContent = formatCount(counts.working);
  elements.metrics.attention.textContent = formatCount((counts.attention ?? 0) + (counts.waiting ?? 0) + (counts.unavailable ?? 0));
  elements.metrics.queued.textContent = formatCount(counts.queued);
  elements.metrics.events.textContent = `${model.events.length} / ${BROWSER_EVENT_LIMIT}`;
  elements.metrics.memory.textContent = model.snapshot?.runtime?.rssMb ? `${model.snapshot.runtime.rssMb} MB` : "-- MB";
}

function renderAcknowledgements() {
  const newTasks = [...model.tasks.values()].filter(isUnacknowledged);
  elements.ackAll.hidden = newTasks.length === 0;
  elements.newCount.textContent = String(newTasks.length);
}

function setupInteractions() {
  for (const tab of elements.tabs) {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
    tab.addEventListener("keydown", (event) => {
      const index = elements.tabs.indexOf(tab);
      let target = null;
      if (event.key === "ArrowRight") target = elements.tabs[(index + 1) % elements.tabs.length];
      if (event.key === "ArrowLeft") target = elements.tabs[(index - 1 + elements.tabs.length) % elements.tabs.length];
      if (event.key === "Home") target = elements.tabs[0];
      if (event.key === "End") target = elements.tabs[elements.tabs.length - 1];
      if (!target) return;
      event.preventDefault();
      setMode(target.dataset.mode);
      target.focus();
    });
  }
  elements.search.addEventListener("input", () => {
    model.query = elements.search.value;
    render();
  });
  for (const button of elements.filters) {
    button.addEventListener("click", () => {
      model.filter = button.dataset.filter;
      for (const item of elements.filters) item.setAttribute("aria-pressed", String(item === button));
      render();
    });
  }
  elements.ackAll.addEventListener("click", () => {
    for (const task of model.tasks.values()) if (task.newAgent) model.acknowledged.add(ackKey(task));
    persistAcknowledgements();
    render();
  });
  elements.motionToggle.addEventListener("click", () => {
    model.staticMode = !model.staticMode;
    try { localStorage.setItem("ai-dashboard-motion", model.staticMode ? "static" : "eco"); } catch {}
    applyMotionMode();
  });
  reducedMotion.addEventListener?.("change", applyMotionMode);
  document.addEventListener("visibilitychange", () => {
    document.body.dataset.hidden = String(document.hidden);
    updateRadarState();
  });
  window.addEventListener("pagehide", () => {
    source?.close();
    stopRadar();
  }, { once: true });
}

function setMode(mode) {
  model.mode = mode;
  const headings = { flowline: "Flowline planning", operations: "Operations constellation", ledger: "Event ledger" };
  elements.modeHeading.textContent = headings[mode];
  for (const tab of elements.tabs) {
    const selected = tab.dataset.mode === mode;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of elements.panels) panel.hidden = panel.id !== `panel-${mode}`;
  render();
}

function selectItem(id) {
  model.selectedId = id;
  render();
  if (window.matchMedia("(max-width: 819px)").matches) document.querySelector(".inspector")?.scrollIntoView({ block: "start", behavior: model.staticMode || reducedMotion.matches ? "auto" : "smooth" });
}

function acknowledge(task) {
  model.acknowledged.add(ackKey(task));
  persistAcknowledgements();
  render();
}

function taskButton(item, className) {
  const state = item.displayState || (item.state === "done" ? "completed" : item.state);
  const label = item.displayStateLabel || stateLabel(state);
  const button = el("button", `${className} state-${state}${model.selectedId === item.id ? " selected" : ""}${isUnacknowledged(item) ? " new-agent" : ""}`);
  button.type = "button";
  button.dataset.taskId = item.id;
  button.setAttribute("aria-pressed", String(model.selectedId === item.id));
  const top = el("span", "task-topline");
  top.append(el("span", "task-agent", item.agentName || item.id.toUpperCase()), statusChip(state, label));
  if (isUnacknowledged(item)) top.append(el("em", "new-label", "NEW"));
  button.append(top, el("strong", "task-title", item.title), el("span", "task-workstream", item.workstream || "Unassigned"));
  if (item.entityType === "task" && item.displayState === "joining" && item.state !== "joining") button.append(el("small", "truth-note", `Current truth: ${item.stateLabel}`));
  button.addEventListener("click", () => selectItem(item.id));
  return button;
}

function statusChip(state, label) {
  const chip = el("span", `status-chip state-${state}`);
  const marker = el("i");
  marker.setAttribute("aria-hidden", "true");
  chip.append(marker, document.createTextNode(label));
  return chip;
}

function inspectorIdentity(name, label, state) {
  const section = el("section", "identity-block");
  const wrap = el("div");
  wrap.append(el("span", "eyebrow", "SELECTED RECORD"), el("h3", "", name));
  section.append(wrap, statusChip(state, label));
  return section;
}

function inspectorSection(label, value) {
  const section = el("section", "inspector-section");
  section.append(el("span", "eyebrow", label.toUpperCase()), el("h4", "", value));
  return section;
}

function inspectorNote(label, value) {
  const section = el("section", "inspector-note");
  section.append(el("span", "eyebrow", label.toUpperCase()), el("p", "", value));
  return section;
}

function inspectorDefinition(rows) {
  const list = el("dl", "definition-list");
  for (const [term, description] of rows) {
    list.append(el("dt", "", term), el("dd", "", description || "Not available"));
  }
  return list;
}

function stateMessage(title, description, className = "state-message") {
  const block = el("div", className);
  block.append(el("strong", "", title), el("span", "", description));
  return block;
}

function setConnection(state, label) {
  model.connection = state;
  elements.connection.dataset.state = state;
  elements.connection.querySelector("span").textContent = label;
}

function updateSystemFooter() {
  const snapshot = model.snapshot;
  if (!snapshot) return;
  elements.bridgeDetail.textContent = snapshot.integration?.available
    ? `One local process / one SSE bridge / ${snapshot.integration.statusFilesAre} / read only`
    : "Local bridge unavailable / read only";
  elements.lastReconciled.textContent = snapshot.reconciledAt
    ? `Reconciled ${formatObserved(snapshot.reconciledAt)} / current truth: ${snapshot.integration.currentStateAuthority}`
    : "Waiting for first reconciliation";
}

function applyMotionMode() {
  const staticEffective = model.staticMode || reducedMotion.matches;
  elements.body.dataset.motion = staticEffective ? "static" : "eco";
  elements.motionToggle.setAttribute("aria-pressed", String(model.staticMode));
  elements.motionToggle.textContent = model.staticMode ? "STATIC / 0 FPS" : reducedMotion.matches ? "REDUCED / 0 FPS" : "ECO / 12 FPS";
  elements.motionReadout.textContent = staticEffective ? "static 0 FPS" : "capped 12 FPS";
  updateRadarState();
}

function updateRadarState() {
  const run = shouldRunRadar({ staticMode: model.staticMode, reducedMotion: reducedMotion.matches, hidden: document.hidden, mode: model.mode });
  if (run && radarFrame === null) radarFrame = requestAnimationFrame(stepRadar);
  if (!run) stopRadar();
}

function stepRadar(timestamp) {
  if (!shouldRunRadar({ staticMode: model.staticMode, reducedMotion: reducedMotion.matches, hidden: document.hidden, mode: model.mode })) return stopRadar();
  if (timestamp - radarLastFrame >= 83) {
    radarAngle = (radarAngle + 1.5) % 360;
    document.getElementById("radar-sweep")?.style.setProperty("transform", `rotate(${radarAngle}deg)`);
    radarLastFrame = timestamp;
  }
  radarFrame = requestAnimationFrame(stepRadar);
}

function stopRadar() {
  if (radarFrame !== null) cancelAnimationFrame(radarFrame);
  radarFrame = null;
  radarLastFrame = 0;
}

function loadMotionPreference() {
  try { return localStorage.getItem("ai-dashboard-motion") === "static"; } catch { return false; }
}

function loadAcknowledgements() {
  try {
    const values = JSON.parse(localStorage.getItem("ai-dashboard-acknowledged") || "[]");
    return new Set(Array.isArray(values) ? values.slice(-BROWSER_EVENT_LIMIT) : []);
  } catch { return new Set(); }
}

function persistAcknowledgements() {
  try {
    const bounded = [...model.acknowledged].slice(-BROWSER_EVENT_LIMIT);
    model.acknowledged = new Set(bounded);
    localStorage.setItem("ai-dashboard-acknowledged", JSON.stringify(bounded));
  } catch {}
}

function isUnacknowledged(task) {
  return Boolean(task?.newAgent && !model.acknowledged.has(ackKey(task)));
}

function firstSelectableId() {
  return model.tasks.keys().next().value || model.plans[0]?.id || null;
}

function filterOptions() {
  return { filter: model.filter, query: model.query, acknowledged: model.acknowledged };
}

function eventMatchesFilter(event) {
  if (model.filter === "new" && event.type !== "task.spawned") return false;
  if (model.filter === "attention" && !["attention", "blocked", "waiting", "unavailable", "needs-decision", "paused", "failed"].includes(event.state)) return false;
  if (model.filter === "completed" && !["completed", "done"].includes(event.state)) return false;
  const needle = model.query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [event.source, event.message, event.label, event.workstream, event.taskId].some((value) => String(value ?? "").toLocaleLowerCase().includes(needle));
}

function eventToLedger(event) {
  return {
    key: `browser:${event.id}`,
    type: event.type,
    source: "LOCAL BRIDGE",
    label: "Bridge error",
    message: event.payload?.message || "The local fleet bridge reported an error.",
    state: "unavailable",
    workstream: "System",
    createdAt: event.createdAt,
    observedAt: event.createdAt,
    historical: false,
  };
}

function cell(value, className = "", label = "") {
  const td = el("td", className, value ?? "Not available");
  if (label) td.dataset.label = label;
  return td;
}

function formatObserved(value) {
  if (!value) return "Not observed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not observed";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(date);
}

function formatCount(value) {
  return Number.isFinite(value) ? String(value).padStart(2, "0") : "--";
}

function el(tag, className = "", text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}

function svgElement(tag, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function svgText(x, y, text, className) {
  const node = svgElement("text", { x, y, class: className, "text-anchor": className.includes("start") ? "start" : className.includes("end") ? "end" : "middle" });
  node.textContent = text;
  return node;
}

function svgTitle(text) {
  const node = svgElement("title", { id: "topology-svg-title" });
  node.textContent = text;
  return node;
}

function svgDescription(text) {
  const node = svgElement("desc", { id: "topology-svg-desc" });
  node.textContent = text;
  return node;
}
