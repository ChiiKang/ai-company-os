import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BROWSER_EVENT_LIMIT,
  ackKey,
  appendBoundedEvent,
  filterFleet,
  flowColumnFor,
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

test("radar liveness stops for static, reduced-motion, hidden, and non-topology views", () => {
  assert.equal(shouldRunRadar({ staticMode: false, reducedMotion: false, hidden: false, mode: "operations" }), true);
  assert.equal(shouldRunRadar({ staticMode: true, reducedMotion: false, hidden: false, mode: "operations" }), false);
  assert.equal(shouldRunRadar({ staticMode: false, reducedMotion: true, hidden: false, mode: "operations" }), false);
  assert.equal(shouldRunRadar({ staticMode: false, reducedMotion: false, hidden: true, mode: "operations" }), false);
  assert.equal(shouldRunRadar({ staticMode: false, reducedMotion: false, hidden: false, mode: "flowline" }), false);
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
  assert.doesNotMatch(css, /gradient\(/i);
  assert.doesNotMatch(css, /#000(?:000)?\b|#fff(?:fff)?\b/i);
  assert.doesNotMatch(css, /transition:[^;]*(?:width|height|top|left|margin)/i);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
