import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  FirstmateAdapter,
  parseBacklog,
  parseCrewState,
  parseStatusLine,
  resolveFirstmateIntegration,
} from "../../extensions/ai-dashboard/lib/firstmate-adapter.js";
import { sanitizeText } from "../../extensions/ai-dashboard/lib/sanitize.js";
import { createFirstmateFixture } from "./helpers.mjs";

test("authoritative crew-state parser maps every supported lifecycle state", () => {
  const cases = [
    ["working", "working"],
    ["parked", "attention"],
    ["blocked", "blocked"],
    ["paused", "waiting"],
    ["done", "completed"],
    ["failed", "unavailable"],
    ["unknown", "unavailable"],
  ];
  for (const [raw, expected] of cases) {
    const parsed = parseCrewState(`state: ${raw} · source: run-step · safe detail`);
    assert.equal(parsed.state, expected);
    assert.equal(parsed.stateSource, "run-step");
  }
});

test("backlog and status parsers preserve tasks while treating status as history", () => {
  const backlog = parseBacklog(`## In flight\n- [ ] task-a - Build local bridge (repo: alpha) (kind: ship)\n\n## Queued\n- [ ] task-b - Check race recovery (repo: beta) (kind: scout) blocked-by: task-a\n\n## Done\n- [x] task-c - Publish evidence https://example.test/pull/1 (repo: alpha) (done 2026-01-01)\n`);
  assert.deepEqual(backlog.map((record) => [record.id, record.state, record.workstream]), [
    ["task-a", "in_flight", "alpha"],
    ["task-b", "queued", "beta"],
    ["task-c", "done", "alpha"],
  ]);
  assert.equal(backlog[1].blockedBy, "task-a");
  const history = parseStatusLine("task-a", "blocked [key=fixture]: waiting for fixture", "2026-01-01T00:00:00Z");
  assert.equal(history.historical, true);
  assert.equal(history.label, "Blocked event");
});

test("status history identity is independent of the position inside the bounded tail window", () => {
  const line = "working: implementation underway";
  const first = parseStatusLine("task-a", line, "2026-01-01T00:00:00Z", 0);
  const shifted = parseStatusLine("task-a", line, "2026-01-01T00:00:01Z", 7);
  assert.equal(first.fingerprint, shifted.fingerprint, "a shifted window must not change the identity of the same line");
  assert.equal(first.ordinal, 0);
  assert.equal(shifted.ordinal, 7);
  assert.notEqual(first.fingerprint, parseStatusLine("task-a", "working: something else", "2026-01-01T00:00:00Z", 0).fingerprint);
});

test("adapter resolves FM_HOME safely, reconciles through the script, and exposes no private body", async () => {
  const fixture = await createFirstmateFixture("adapter");
  const privateReport = path.join(fixture.home, "data", "alpha-task", "report.md");
  const githubCredentialFixture = ["ghp", "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"].join("_");
  await writeFile(path.join(fixture.home, "state", "alpha-task.status"), `working: bearer ${githubCredentialFixture} at /Users/private/report.md\n`);
  await import("node:fs/promises").then(({ mkdir }) => mkdir(path.dirname(privateReport), { recursive: true }));
  await writeFile(privateReport, "PRIVATE REPORT BODY SHOULD NEVER APPEAR");
  try {
    const resolution = await resolveFirstmateIntegration({ fmHome: fixture.home, firstmateRoot: fixture.root, cwd: fixture.home, env: { PATH: process.env.PATH } });
    assert.equal(resolution.available, true);
    assert.equal(resolution.source, "FM_HOME");
    const adapter = new FirstmateAdapter(resolution, { stateTimeoutMs: 1_000 });
    const inventory = await adapter.readInventory();
    assert.equal(inventory.tasks.length, 1);
    assert.equal(inventory.tasks[0].title, "Build bounded local telemetry");
    assert.equal(inventory.tasks[0].workstream, "alpha");
    const state = await adapter.reconcileTask("alpha-task");
    assert.equal(state.state, "working");
    const serialized = JSON.stringify({ inventory, state });
    assert.equal(serialized.includes("PRIVATE REPORT BODY"), false);
    assert.equal(serialized.includes("captain-prompt.md"), false);
    assert.equal(serialized.includes("ghp_"), false);
    assert.equal(serialized.includes("/Users/private"), false);
    adapter.close();
  } finally {
    await fixture.cleanup();
  }
});

test("adapter inventory and per-task status history enforce configured ceilings", async () => {
  const fixture = await createFirstmateFixture("adapter-bounds");
  try {
    await fixture.addTask("beta-task", { status: "working: beta" });
    await fixture.addTask("gamma-task", { status: "working: gamma" });
    await writeFile(path.join(fixture.stateDir, "alpha-task.status"), Array.from({ length: 8 }, (_, index) => `working: history ${index}`).join("\n"));
    const resolution = await resolveFirstmateIntegration({ fmHome: fixture.home, firstmateRoot: fixture.root, cwd: fixture.home, env: { PATH: process.env.PATH } });
    const adapter = new FirstmateAdapter(resolution, { maxTasks: 2, maxStatusLines: 3 });
    const inventory = await adapter.readInventory();
    assert.equal(inventory.tasks.length, 2);
    assert.equal(inventory.truncated, true);
    assert.equal(inventory.histories.get("alpha-task").length, 3);
    adapter.close();
  } finally {
    await fixture.cleanup();
  }
});

test("a task record that vanishes mid-read degrades to one unreadable row instead of failing the inventory", async () => {
  const fixture = await createFirstmateFixture("adapter-race");
  try {
    await fixture.writeBacklog([
      { id: "alpha-task", title: "Build bounded local telemetry", state: "in_flight", repo: "alpha" },
      { id: "beta-task", title: "Verify race recovery", state: "in_flight", repo: "beta" },
    ]);
    await fixture.addTask("beta-task", { project: "beta" });
    const resolution = await resolveFirstmateIntegration({ fmHome: fixture.home, firstmateRoot: fixture.root, cwd: fixture.home, env: { PATH: process.env.PATH } });
    const adapter = new FirstmateAdapter(resolution, { stateTimeoutMs: 1_000 });
    const readStatusHistory = adapter.readStatusHistory.bind(adapter);
    adapter.readStatusHistory = async (id) => {
      if (id === "beta-task") throw Object.assign(new Error("ENOENT: task record removed mid-read"), { code: "ENOENT" });
      return readStatusHistory(id);
    };

    const inventory = await adapter.readInventory();
    assert.equal(inventory.error, null);
    assert.deepEqual(inventory.tasks.map((task) => task.id).sort(), ["alpha-task", "beta-task"]);
    const alpha = inventory.tasks.find((task) => task.id === "alpha-task");
    assert.equal(alpha.state, "unavailable");
    assert.equal(alpha.workstream, "alpha");
    const beta = inventory.tasks.find((task) => task.id === "beta-task");
    assert.equal(beta.title, "Verify race recovery", "the unreadable row must still use its planned backlog title");
    assert.equal(beta.workstream, "beta");
    assert.equal(beta.detail, "The local task record could not be read safely.");
    assert.deepEqual(inventory.histories.get("beta-task"), []);
    adapter.close();
  } finally {
    await fixture.cleanup();
  }
});

test("an unreadable task with no backlog record still yields a bounded fallback row", async () => {
  const fixture = await createFirstmateFixture("adapter-race-unplanned");
  try {
    await fixture.addTask("orphan-task", { project: "orphan" });
    await fixture.writeBacklog([]);
    const resolution = await resolveFirstmateIntegration({ fmHome: fixture.home, firstmateRoot: fixture.root, cwd: fixture.home, env: { PATH: process.env.PATH } });
    const adapter = new FirstmateAdapter(resolution, { stateTimeoutMs: 1_000 });
    adapter.readStatusHistory = async () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); };

    const inventory = await adapter.readInventory();
    assert.equal(inventory.error, null);
    const orphan = inventory.tasks.find((task) => task.id === "orphan-task");
    assert.equal(orphan.title, "Orphan Task");
    assert.equal(orphan.workstream, "Unassigned");
    adapter.close();
  } finally {
    await fixture.cleanup();
  }
});

test("sanitizer redacts credentials and absolute local paths", () => {
  const apiCredentialFixture = ["sk", "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"].join("-");
  const value = sanitizeText(`token=${apiCredentialFixture} at /Users/name/private.txt`);
  assert.equal(value.includes("sk-"), false);
  assert.equal(value.includes("/Users/"), false);
  assert.match(value, /\[redacted\]/);
  assert.match(value, /\[local path\]/);
});

test("unconfigured adapter fails safe without guessing private paths", async () => {
  const resolution = await resolveFirstmateIntegration({ cwd: "/", env: { PATH: "" } });
  assert.equal(resolution.available, false);
  assert.match(resolution.error, /Set FM_HOME/);
});
