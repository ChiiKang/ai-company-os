import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BROWSER_EVENT_LIMIT,
  DEFAULT_LEDGER_EMPTY,
  STREAM_CLOSED_COPY,
  ackKey,
  appendBoundedEvent,
  bridgeFailedFor,
  connectionReadout,
  filterFleet,
  flowColumnFor,
  ledgerEmptyCopy,
  shouldRunRadar,
  topologyLayout,
} from "../../extensions/ai-dashboard/public/app-core.js";

const htmlUrl = new URL("../../extensions/ai-dashboard/public/index.html", import.meta.url);
const cssUrl = new URL("../../extensions/ai-dashboard/public/styles.css", import.meta.url);
const appUrl = new URL("../../extensions/ai-dashboard/public/app.js", import.meta.url);

test("browser event history and acknowledgement storage stay bounded", () => {
  let events = [];
  for (let index = 0; index < 260; index += 1) events = appendBoundedEvent(events, { key: String(index), createdAt: index });
  assert.equal(events.length, BROWSER_EVENT_LIMIT);
  assert.equal(events[0].key, "259");
  assert.equal(events.at(-1).key, "60");
  assert.equal(ackKey({ id: "agent-a", firstSeenAt: "now" }), "agent-a:now");
});

test("Flowline, filters, and topology are derived from actual fleet records", () => {
  const tasks = [
    { id: "a", agentName: "A", title: "Build", workstream: "Alpha", state: "working", displayState: "working", entityType: "task" },
    { id: "b", agentName: "B", title: "Wait", workstream: "Beta", state: "waiting", displayState: "waiting", entityType: "task", newAgent: true, firstSeenAt: "one" },
    { id: "c", agentName: "C", title: "Done", workstream: "Alpha", state: "completed", displayState: "completed", entityType: "task" },
  ];
  assert.deepEqual(tasks.map(flowColumnFor), ["active", "attention", "verified"]);
  assert.deepEqual(filterFleet(tasks, { filter: "attention" }).map((task) => task.id), ["b"]);
  assert.deepEqual(filterFleet(tasks, { filter: "new", acknowledged: new Set() }).map((task) => task.id), ["b"]);
  const layout = topologyLayout(tasks);
  assert.deepEqual(layout.hubs.map((hub) => hub.name).sort(), ["Alpha", "Beta"]);
  assert.equal(layout.nodes.length, 3);
  assert.equal(layout.routes.length, 3);
});

test("agents sharing one workstream stay non-overlapping at narrow, tablet, and wide sizes", () => {
  const tasks = Array.from({ length: 14 }, (_, index) => ({
    id: `agent-${index}`,
    agentName: `AGENT-${index}`,
    title: "Shared workstream delivery",
    workstream: "Shared platform workstream",
    state: "working",
    displayState: "working",
  }));

  for (const viewport of [{ width: 328, height: 470 }, { width: 620, height: 600 }, { width: 980, height: 560 }]) {
    const label = `${viewport.width}x${viewport.height}`;
    const layout = topologyLayout(tasks, viewport);
    assert.ok(layout.nodes.length > 0, `${label} must place at least one agent`);
    assert.equal(layout.nodes.length + layout.omittedAgents, tasks.length, `${label} must account for every agent`);
    assert.ok(layout.nodeHeight >= 56, `${label} must fit the agent name, state, and NEW label without spilling`);

    for (const [index, node] of layout.nodes.entries()) {
      assert.ok(node.x - layout.nodeWidth / 2 >= -0.01 && node.x + layout.nodeWidth / 2 <= layout.width + 0.01, `${label} node ${index} left the board`);
      assert.ok(node.y - layout.nodeHeight / 2 >= -0.01 && node.y + layout.nodeHeight / 2 <= layout.height + 0.01, `${label} node ${index} left the board`);
      for (const other of layout.nodes.slice(index + 1)) {
        const overlaps = Math.abs(node.x - other.x) < layout.nodeWidth - 0.01 && Math.abs(node.y - other.y) < layout.nodeHeight - 0.01;
        assert.equal(overlaps, false, `${label} labels for ${node.task.id} and ${other.task.id} overlap`);
      }
    }
  }

  const crowded = topologyLayout(tasks, { width: 328, height: 470 });
  assert.ok(crowded.hubs[0].label.length <= crowded.hubs[0].name.length, "hub labels must stay bounded to their arc");
});

test("a terminal SSE refusal is reported as a distinct closed state with recovery guidance", async () => {
  assert.deepEqual(connectionReadout({ transport: "closed", bridgeFailed: false }), { state: "closed", label: "Stream closed" });
  assert.deepEqual(connectionReadout({ transport: "closed", bridgeFailed: true }), { state: "closed", label: "Stream closed" });
  assert.match(STREAM_CLOSED_COPY.description, /reload this page/i);

  const app = await readFile(appUrl, "utf8");
  assert.match(app, /source\.readyState === EventSource\.CLOSED/);
  assert.match(app, /renderFailure\(STREAM_CLOSED_COPY\.title, STREAM_CLOSED_COPY\.description/);
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /\.connection-state\[data-state="closed"\]/);
});

test("radar liveness stops for static, reduced-motion, hidden, and non-topology views", () => {
  assert.equal(shouldRunRadar({ staticMode: false, reducedMotion: false, hidden: false, mode: "operations" }), true);
  assert.equal(shouldRunRadar({ staticMode: true, reducedMotion: false, hidden: false, mode: "operations" }), false);
  assert.equal(shouldRunRadar({ staticMode: false, reducedMotion: true, hidden: false, mode: "operations" }), false);
  assert.equal(shouldRunRadar({ staticMode: false, reducedMotion: false, hidden: true, mode: "operations" }), false);
  assert.equal(shouldRunRadar({ staticMode: false, reducedMotion: false, hidden: false, mode: "flowline" }), false);
});

test("connection readout distinguishes transport states from bridge failure and recovers", () => {
  assert.deepEqual(connectionReadout({ transport: "connecting", bridgeFailed: false }), { state: "connecting", label: "Connecting" });
  assert.deepEqual(connectionReadout({ transport: "reconnecting", bridgeFailed: true }), { state: "reconnecting", label: "Reconnecting" });
  assert.deepEqual(connectionReadout({ transport: "live", bridgeFailed: true }), { state: "error", label: "Bridge error" });
  assert.deepEqual(connectionReadout({ transport: "live", bridgeFailed: false }), { state: "live", label: "Live / SSE" });

  assert.equal(bridgeFailedFor("error"), true);
  assert.equal(bridgeFailedFor("unavailable"), true);
  assert.equal(bridgeFailedFor("ready"), false);
  assert.equal(bridgeFailedFor("empty"), false);
  assert.equal(bridgeFailedFor("loading"), false);

  const failed = { transport: "live", bridgeFailed: bridgeFailedFor("error") };
  assert.equal(connectionReadout(failed).state, "error");
  assert.equal(connectionReadout({ ...failed, bridgeFailed: bridgeFailedFor("ready") }).state, "live");
});

test("ledger empty-state copy is restored once the bridge recovers", async () => {
  const hint = "Check the Firstmate home.";
  const failure = ledgerEmptyCopy({ phase: "error", hint });
  assert.equal(failure.title, "Event ledger unavailable");
  assert.equal(failure.description, hint);
  for (const phase of ["ready", "empty", "loading", undefined]) {
    assert.deepEqual(ledgerEmptyCopy({ phase, hint }), DEFAULT_LEDGER_EMPTY, `phase ${phase} must restore the real empty state`);
  }

  const html = await readFile(htmlUrl, "utf8");
  assert.match(html, new RegExp(escapeRegExp(DEFAULT_LEDGER_EMPTY.title)));
  assert.match(html, new RegExp(escapeRegExp(DEFAULT_LEDGER_EMPTY.description)));
});

test("HTML exposes keyboard landmarks, explicit states, and three functional modes", async () => {
  const html = await readFile(htmlUrl, "utf8");
  for (const required of [
    'href="#main-content"',
    'role="tablist"',
    'data-mode="flowline"',
    'data-mode="operations"',
    'data-mode="ledger"',
    'aria-live="polite"',
    'for="fleet-search"',
    "Waiting on external dependency",
    "Blocked / attention needed",
    "Read only",
  ]) assert.match(html, new RegExp(escapeRegExp(required)));
  assert.doesNotMatch(html, /https?:\/\/(?!127\.0\.0\.1|localhost)/);
  assert.doesNotMatch(html, /<canvas|webgl|three\.js/i);
});

test("browser code uses one EventSource and no panel polling loops", async () => {
  const app = await readFile(appUrl, "utf8");
  assert.equal((app.match(/new EventSource\(/g) || []).length, 1);
  assert.equal((app.match(/setInterval\(/g) || []).length, 0);
  assert.equal((app.match(/fetch\(/g) || []).length, 0);
  assert.match(app, /localStorage\.setItem\("ai-dashboard-motion"/);
  assert.match(app, /slice\(-BROWSER_EVENT_LIMIT\)/);
  assert.match(app, /document\.addEventListener\("visibilitychange"/);
  assert.match(app, /td\.dataset\.label = label/);
  assert.equal((app.match(/ledgerEmpty\.querySelector\(/g) || []).length, 2, "ledger empty-state copy must only be written through setLedgerEmpty");
  assert.match(app, /setLedgerEmpty\(ledgerEmptyCopy\(/);
});

test("responsive, contrast-support, and reduced-motion CSS contracts cover narrow, tablet, and wide layouts", async () => {
  const css = await readFile(cssUrl, "utf8");
  assert.match(css, /@media \(max-width: 639px\)/);
  assert.match(css, /@media \(min-width: 640px\)/);
  assert.match(css, /@media \(min-width: 820px\)/);
  assert.match(css, /@media \(min-width: 1180px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /@media \(pointer: coarse\)/);
  assert.match(css, /\.flowline-board > \.state-message[^{]*\{[^}]*grid-column: 1 \/ -1/, "unavailable and error recovery copy must span the whole Flowline board");
  assert.match(css, /\.flowline-board > \.state-message, \.flowline-board > \.loading-state/, "loading copy must span the board on every breakpoint");
  assert.doesNotMatch(css, /gradient\(/i);
  assert.doesNotMatch(css, /#000(?:000)?\b|#fff(?:fff)?\b/i);
  assert.doesNotMatch(css, /transition:[^;]*(?:width|height|top|left|margin)/i);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
