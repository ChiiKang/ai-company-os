import assert from "node:assert/strict";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import test from "node:test";
import { DashboardServer, getOrStartDashboard } from "../../extensions/ai-dashboard/lib/dashboard-server.js";
import { FirstmateAdapter, resolveFirstmateIntegration } from "../../extensions/ai-dashboard/lib/firstmate-adapter.js";
import { createFirstmateFixture } from "./helpers.mjs";

async function fixtureServer(name = "server") {
  const fixture = await createFirstmateFixture(name);
  const resolution = await resolveFirstmateIntegration({ fmHome: fixture.home, firstmateRoot: fixture.root, cwd: fixture.home, env: { PATH: process.env.PATH } });
  const adapter = new FirstmateAdapter(resolution, { stateTimeoutMs: 1_000 });
  const server = new DashboardServer({ adapter, port: 0, bridgeOptions: { reconcileMs: 60_000 } });
  await server.start();
  await server.ready;
  return { fixture, server, resolution };
}

test("server binds only to IPv4 loopback and sends strict security headers", async () => {
  assert.throws(() => new DashboardServer({ adapter: {}, host: "0.0.0.0" }), /only bind to 127\.0\.0\.1/);
  const { fixture, server } = await fixtureServer("security");
  try {
    assert.equal(server.address.address, "127.0.0.1");
    const response = await fetch(server.url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    const snapshot = await (await fetch(`${server.url}api/snapshot`)).text();
    assert.equal(snapshot.includes(fixture.home), false, "raw FM_HOME path must not be exposed");
  } finally {
    await server.close();
    await fixture.cleanup();
  }
});

test("server rejects traversal, foreign origins, writes, and private-looking routes", async () => {
  const { fixture, server } = await fixtureServer("routes");
  try {
    const traversal = await rawRequest(server.port, "/%2e%2e/%2e%2e/etc/passwd");
    assert.equal(traversal.status, 400);
    const foreign = await fetch(`${server.url}api/health`, { headers: { Origin: "https://evil.example" } });
    assert.equal(foreign.status, 403);
    const post = await fetch(`${server.url}api/health`, { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal((await fetch(`${server.url}.env`)).status, 404);
    assert.equal((await fetch(`${server.url}report.md`)).status, 404);
  } finally {
    await server.close();
    await fixture.cleanup();
  }
});

test("foreign port conflict is refused instead of silently reusing another service", async () => {
  const fixture = await createFirstmateFixture("port-conflict");
  const foreign = createHttpServer((_request, response) => response.end("not the dashboard"));
  await new Promise((resolve) => foreign.listen(0, "127.0.0.1", resolve));
  const port = foreign.address().port;
  try {
    await assert.rejects(
      getOrStartDashboard({ port, fmHome: fixture.home, firstmateRoot: fixture.root, cwd: fixture.home }),
      (error) => error.code === "PORT_CONFLICT",
    );
  } finally {
    await new Promise((resolve) => foreign.close(resolve));
    await fixture.cleanup();
  }
});

test("matching dashboard on the configured port is safely reused across extension instances", async () => {
  const { fixture, server } = await fixtureServer("safe-reuse");
  try {
    const result = await getOrStartDashboard({ port: server.port, fmHome: fixture.home, firstmateRoot: fixture.root, cwd: fixture.home });
    assert.equal(result.reused, true);
    assert.equal(result.owned, false);
    assert.equal(result.instance, null);
    assert.equal(result.url, server.url);
  } finally {
    await server.close();
    await fixture.cleanup();
  }
});

test("clean shutdown closes SSE, watchers, and reachability", async () => {
  const { fixture, server } = await fixtureServer("shutdown");
  const url = server.url;
  await server.close();
  assert.equal(server.closed, true);
  assert.equal(server.broker.closed, true);
  assert.equal(server.bridge.watchers.length, 0);
  assert.equal(server.adapter.children.size, 0);
  await assert.rejects(fetch(`${url}api/health`));
  await fixture.cleanup();
});

function rawRequest(port, target) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: "127.0.0.1", port, path: target, headers: { Host: `127.0.0.1:${port}` } }, (response) => {
      response.resume();
      response.once("end", () => resolve({ status: response.statusCode, headers: response.headers }));
    });
    request.once("error", reject);
    request.end();
  });
}
