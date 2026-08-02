import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import { EventBroker } from "../../extensions/ai-dashboard/lib/event-broker.js";
import { DashboardServer } from "../../extensions/ai-dashboard/lib/dashboard-server.js";
import { FirstmateAdapter, resolveFirstmateIntegration } from "../../extensions/ai-dashboard/lib/firstmate-adapter.js";
import { FleetBridge } from "../../extensions/ai-dashboard/lib/fleet-bridge.js";
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

test("a backpressured frame waits for drain instead of dropping the SSE client", () => {
  const broker = new EventBroker({ retention: 8, heartbeatMs: 60_000, eventByteLimit: 2048, clientBufferBytes: 8192, backpressureTimeoutMs: 60_000 });
  try {
    const response = stalledResponse();
    assert.equal(broker.connect(response, { snapshot: { blob: "x".repeat(600) } }), true);
    const [client] = broker.clients;
    assert.ok(client.pendingBytes > 0, "the unflushed snapshot frame must be accounted as pending");
    assert.equal(broker.clients.size, 1, "an oversized first frame must not disconnect the client");

    broker.publish("fixture.large", { blob: "y".repeat(600) });
    assert.equal(broker.clients.size, 1, "a second backpressured frame must not disconnect the client");
    assert.equal(response.writableEnded, false);

    response.drain();
    assert.equal(client.pendingBytes, 0);
    assert.equal(client.stallTimer, null);
    assert.equal(broker.clients.size, 1);
  } finally {
    broker.close();
  }
});

test("a client that never drains is dropped at the bounded per-client buffer ceiling", () => {
  const broker = new EventBroker({ retention: 64, heartbeatMs: 60_000, eventByteLimit: 1024, clientBufferBytes: 4096, backpressureTimeoutMs: 60_000 });
  try {
    const response = stalledResponse();
    broker.connect(response, { snapshot: { blob: "x".repeat(200) } });
    for (let index = 0; index < 32 && broker.clients.size > 0; index += 1) broker.publish("fixture", { blob: "y".repeat(200) });
    assert.equal(broker.clients.size, 0, "an unbounded pending buffer must not accumulate");
    assert.equal(response.writableEnded, true);
  } finally {
    broker.close();
  }
});

test("a stalled client is dropped after the bounded backpressure timeout", async () => {
  const broker = new EventBroker({ heartbeatMs: 60_000, eventByteLimit: 4096, clientBufferBytes: 1024 * 1024, backpressureTimeoutMs: 100 });
  try {
    const response = stalledResponse();
    broker.connect(response, { snapshot: { blob: "x".repeat(600) } });
    assert.equal(broker.clients.size, 1);
    await waitFor(() => broker.clients.size === 0, { message: "stalled client eviction" });
    assert.equal(response.writableEnded, true);
  } finally {
    broker.close();
  }
});

test("an SSE frame larger than the socket high-water mark is delivered without a reconnect loop", async () => {
  const fixture = await createFirstmateFixture("sse-backpressure");
  const resolution = await resolveFirstmateIntegration({ fmHome: fixture.home, firstmateRoot: fixture.root, cwd: fixture.home, env: { PATH: process.env.PATH } });
  const server = new DashboardServer({
    adapter: new FirstmateAdapter(resolution, { stateTimeoutMs: 1_000 }),
    port: 0,
    brokerOptions: { retention: 8, heartbeatMs: 60_000 },
    bridgeOptions: { reconcileMs: 60_000 },
  });
  await server.start();
  await server.ready;
  try {
    const blob = "z".repeat(64 * 1024);
    let oversizedBytes = 0;
    const streamPromise = readSseUntil(`${server.url}events`, (event) => {
      if (event.type === "fixture.oversized") oversizedBytes = event.payload.blob.length;
      return event.type === "fixture.oversized.followup";
    });
    await waitFor(() => server.broker.clients.size === 1, { message: "SSE client registration" });
    server.broker.publish("fixture.oversized", { blob });
    server.broker.publish("fixture.oversized.followup", { ok: true });
    const followup = await streamPromise;
    assert.equal(oversizedBytes, blob.length, "the oversized frame must be delivered intact");
    assert.equal(followup.payload.ok, true, "the client must stay connected after a frame above the 16 KiB socket high-water mark");
  } finally {
    await server.close();
    await fixture.cleanup();
  }
});

test("SSE requests beyond the bounded client limit are refused with 503 instead of a retry storm", async () => {
  const fixture = await createFirstmateFixture("sse-capacity");
  const resolution = await resolveFirstmateIntegration({ fmHome: fixture.home, firstmateRoot: fixture.root, cwd: fixture.home, env: { PATH: process.env.PATH } });
  const server = new DashboardServer({
    adapter: new FirstmateAdapter(resolution, { stateTimeoutMs: 1_000 }),
    port: 0,
    brokerOptions: { clientLimit: 1, heartbeatMs: 60_000 },
    bridgeOptions: { reconcileMs: 60_000 },
  });
  await server.start();
  await server.ready;
  const controller = new AbortController();
  try {
    const held = await fetch(`${server.url}events`, { signal: controller.signal });
    assert.equal(held.status, 200);
    await waitFor(() => server.broker.clients.size === 1, { message: "first SSE client" });

    const refused = await fetch(`${server.url}events`);
    assert.equal(refused.status, 503);
    assert.match(refused.headers.get("content-type"), /text\/plain/);
    assert.match(await refused.text(), /bounded SSE client limit/);
    assert.equal(server.broker.clients.size, 1);
  } finally {
    controller.abort();
    await server.close();
    await fixture.cleanup();
  }
});

test("a transient reconcile failure reports bridge.error and recovers to a ready snapshot", async () => {
  const fixture = await createFirstmateFixture("bridge-recovery");
  const resolution = await resolveFirstmateIntegration({ fmHome: fixture.home, firstmateRoot: fixture.root, cwd: fixture.home, env: { PATH: process.env.PATH } });
  const adapter = new FirstmateAdapter(resolution, { stateTimeoutMs: 1_000 });
  const server = new DashboardServer({
    adapter,
    port: 0,
    brokerOptions: { retention: 32, heartbeatMs: 60_000 },
    bridgeOptions: { reconcileMs: 60_000 },
  });
  await server.start();
  await server.ready;
  try {
    const readInventory = adapter.readInventory.bind(adapter);
    let failNext = true;
    adapter.readInventory = async () => {
      if (!failNext) return readInventory();
      failNext = false;
      throw new Error("transient state directory race");
    };

    await server.bridge.reconcile("manual");
    assert.equal(server.bridge.phase, "error");
    assert.ok(server.broker.events.some((event) => event.type === "bridge.error"));
    assert.equal(server.bridge.snapshot().phase, "error");

    await server.bridge.reconcile("manual");
    assert.equal(server.bridge.phase, "ready");
    assert.equal(server.bridge.error, null);
    const recovered = await (await fetch(`${server.url}api/snapshot`)).json();
    assert.equal(recovered.phase, "ready");
    assert.equal(recovered.error, null);
  } finally {
    await server.close();
    await fixture.cleanup();
  }
});

test("a failed initial reconcile still treats the first successful inventory as the baseline", async () => {
  const fixture = await createFirstmateFixture("bridge-initial-failure");
  const resolution = await resolveFirstmateIntegration({ fmHome: fixture.home, firstmateRoot: fixture.root, cwd: fixture.home, env: { PATH: process.env.PATH } });
  const adapter = new FirstmateAdapter(resolution, { stateTimeoutMs: 1_000 });
  const broker = new EventBroker({ retention: 128, heartbeatMs: 60_000 });
  const bridge = new FleetBridge({ adapter, broker, debounceMs: 30, reconcileMs: 60_000, joiningMs: 2_000 });
  const readInventory = adapter.readInventory.bind(adapter);
  let failNext = true;
  adapter.readInventory = async () => {
    if (!failNext) return readInventory();
    failNext = false;
    throw Object.assign(new Error("ENOENT: the Firstmate state directory is not mounted yet"), { code: "ENOENT" });
  };

  try {
    await bridge.start();
    assert.equal(bridge.phase, "error");
    assert.equal(bridge.tasks.size, 0);
    assert.equal(bridge.hasReconciled, false);

    await bridge.reconcile("periodic");
    assert.equal(bridge.phase, "ready");
    assert.equal(bridge.hasReconciled, true);
    assert.deepEqual([...bridge.tasks.keys()], ["alpha-task"]);
    const alpha = bridge.tasks.get("alpha-task");
    assert.equal(alpha.newAgent, false, "a pre-existing agent must not be marked new after a failed first reconcile");
    assert.equal(alpha.firstSeenAfterBridgeStart, false);
    assert.equal(alpha.joiningUntil, 0);
    assert.equal(
      broker.events.some((event) => event.type === "task.spawned"),
      false,
      "recovering the baseline must not announce pre-existing agents as joining",
    );
    assert.equal(
      broker.events.some((event) => event.type === "history.event"),
      false,
      "pre-existing status history must be imported silently, not republished as live observations",
    );
    assert.ok(bridge.ledger.some((event) => event.taskId === "alpha-task" && event.historical));

    await fixture.addTask("beta-task", { project: "beta", status: "working: beta underway" });
    await waitFor(async () => {
      await bridge.reconcile("full");
      return bridge.tasks.has("beta-task");
    }, { message: "post-baseline spawn" });
    const beta = bridge.tasks.get("beta-task");
    assert.equal(beta.newAgent, true, "a genuinely new agent must stay visible after the baseline");
    assert.equal(beta.firstSeenAfterBridgeStart, true);
    assert.ok(beta.joiningUntil > 0);
    assert.ok(broker.events.some((event) => event.type === "task.spawned" && event.payload?.task?.id === "beta-task"));
  } finally {
    bridge.close();
    broker.close();
    await fixture.cleanup();
  }
});

function fakeResponse() {
  return new Writable({ write(_chunk, _encoding, callback) { callback(); } });
}

function stalledResponse() {
  const pending = [];
  return {
    destroyed: false,
    writableEnded: false,
    pending,
    write(_chunk, callback) {
      pending.push(callback);
      return false;
    },
    end() { this.writableEnded = true; },
    once() {},
    drain() { while (pending.length) pending.shift()?.(); },
  };
}
