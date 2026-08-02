import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import { EventBroker } from "../../extensions/ai-dashboard/lib/event-broker.js";
import { DashboardServer } from "../../extensions/ai-dashboard/lib/dashboard-server.js";
import { FirstmateAdapter, resolveFirstmateIntegration } from "../../extensions/ai-dashboard/lib/firstmate-adapter.js";
import { createFirstmateFixture, readSseUntil, waitFor } from "./helpers.mjs";

test("server event retention and client count are bounded", () => {
  const broker = new EventBroker({ retention: 3, clientLimit: 1, heartbeatMs: 60_000 });
  try {
    for (let index = 0; index < 7; index += 1) broker.publish("fixture", { index });
    assert.deepEqual(broker.events.map((event) => event.payload.index), [4, 5, 6]);
    assert.equal(broker.snapshotStats().retentionLimit, 3);
    const first = fakeResponse();
    const second = fakeResponse();
    assert.equal(broker.connect(first, { snapshot: {} }), true);
    assert.equal(broker.connect(second, { snapshot: {} }), false);
    first.emit("close");
    assert.equal(broker.clients.size, 0);
  } finally {
    broker.close();
  }
});

test("one SSE stream delivers spawn, state, remove, and replay transitions without reload", async (t) => {
  const fixture = await createFirstmateFixture("events");
  const resolution = await resolveFirstmateIntegration({ fmHome: fixture.home, firstmateRoot: fixture.root, cwd: fixture.home, env: { PATH: process.env.PATH } });
  const adapter = new FirstmateAdapter(resolution, { stateTimeoutMs: 1_000 });
  const server = new DashboardServer({
    adapter,
    port: 0,
    brokerOptions: { retention: 16, heartbeatMs: 60_000 },
    bridgeOptions: { debounceMs: 40, reconcileMs: 60_000, joiningMs: 100 },
  });
  await server.start();
  await server.ready;
  try {
    const streamUrl = `${server.url}events`;
    const spawnPromise = readSseUntil(streamUrl, (event) => event.type === "task.spawned" && event.payload?.task?.id === "beta-task");
    const started = Date.now();
    await fixture.addTask("beta-task", { state: "paused", source: "status-log", detail: "waiting for an external release", project: "beta", status: "paused: external release pending" });
    const spawned = await spawnPromise;
    const latencyMs = Date.now() - started;
    t.diagnostic(`spawn-to-SSE latency: ${latencyMs} ms (threshold: < 2000 ms)`);
    assert.equal(spawned.payload.task.displayState, "joining");
    assert.ok(latencyMs < 2_000, `spawn update latency ${latencyMs}ms exceeded test threshold`);

    const snapshot = await waitFor(async () => {
      const value = await (await fetch(`${server.url}api/snapshot`)).json();
      return value.tasks.find((task) => task.id === "beta-task" && task.state === "waiting") ? value : null;
    }, { message: "authoritative waiting state" });
    assert.equal(snapshot.tasks.find((task) => task.id === "beta-task").stateLabel, "Waiting on external dependency");

    const lastEventId = server.broker.events.at(-1).id;
    server.broker.publish("fixture.replay", { safe: true });
    const replayed = await readSseUntil(streamUrl, (event) => event.type === "fixture.replay", { headers: { "Last-Event-ID": String(lastEventId) } });
    assert.equal(replayed.payload.safe, true);
    const currentCursor = server.broker.events.at(-1).id;
    const resumed = await readSseUntil(streamUrl, (event) => event.type === "fleet.snapshot", { headers: { "Last-Event-ID": String(currentCursor) } });
    assert.equal(resumed.payload.schema, "ai-company-dashboard.v1");

    const removePromise = readSseUntil(streamUrl, (event) => event.type === "task.removed" && event.payload?.event?.taskId === "beta-task");
    await fixture.removeTask("beta-task");
    const removed = await removePromise;
    assert.equal(removed.payload.event.state, "unavailable");
    await waitFor(async () => !(await (await fetch(`${server.url}api/snapshot`)).json()).tasks.some((task) => task.id === "beta-task"), { message: "removed task snapshot" });
  } finally {
    await server.close();
    await fixture.cleanup();
  }
});

test("stale SSE cursor receives a bounded reset snapshot", async () => {
  const fixture = await createFirstmateFixture("sse-reset");
  const resolution = await resolveFirstmateIntegration({ fmHome: fixture.home, firstmateRoot: fixture.root, cwd: fixture.home, env: { PATH: process.env.PATH } });
  const server = new DashboardServer({ adapter: new FirstmateAdapter(resolution, { stateTimeoutMs: 1_000 }), port: 0, brokerOptions: { retention: 2 } });
  await server.start();
  await server.ready;
  try {
    for (let index = 0; index < 5; index += 1) server.broker.publish("fixture", { index });
    const reset = await readSseUntil(`${server.url}events`, (event) => event.type === "stream.reset", { headers: { "Last-Event-ID": "1" } });
    assert.equal(reset.payload.schema, "ai-company-dashboard.v1");
    const restartReset = await readSseUntil(`${server.url}events`, (event) => event.type === "stream.reset", { headers: { "Last-Event-ID": "999" } });
    assert.ok(restartReset.id >= 0 && restartReset.id < 999);
    assert.equal(restartReset.payload.schema, "ai-company-dashboard.v1");
  } finally {
    await server.close();
    await fixture.cleanup();
  }
});

function fakeResponse() {
  return new Writable({ write(_chunk, _encoding, callback) { callback(); } });
}
