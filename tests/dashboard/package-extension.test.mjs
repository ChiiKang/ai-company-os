import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import test from "node:test";
import aiDashboardExtension from "../../extensions/ai-dashboard/index.js";
import { openDashboardURL } from "../../extensions/ai-dashboard/lib/dashboard-server.js";
import { createFirstmateFixture } from "./helpers.mjs";

function fakePi() {
  const commands = new Map();
  const handlers = new Map();
  return {
    commands,
    handlers,
    registerCommand(name, definition) { commands.set(name, definition); },
    on(name, handler) { handlers.set(name, handler); },
  };
}

test("package manifest exposes a discoverable Pi package extension", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.keywords.includes("pi-package"), true);
  assert.deepEqual(manifest.pi.extensions, ["./extensions/ai-dashboard/index.js"]);
  await readFile(new URL("../../extensions/ai-dashboard/index.js", import.meta.url));
  assert.equal(manifest.dependencies, undefined, "runtime uses Node built-ins only");
});

test("extension factory registers /aidashboard without starting resources", () => {
  const pi = fakePi();
  aiDashboardExtension(pi);
  assert.equal(pi.commands.has("aidashboard"), true);
  assert.equal(pi.handlers.has("session_shutdown"), true);
});

test("browser opener is bounded when the platform command does not exit", async () => {
  const child = new EventEmitter();
  let signal = null;
  child.kill = (value) => { signal = value; };
  const result = await openDashboardURL("http://127.0.0.1:4111/", { platform: "linux", timeoutMs: 10, spawnImpl: () => child });
  assert.deepEqual(result, { opened: false, reason: "browser opener timed out" });
  assert.equal(signal, "SIGKILL");
});

test("real command boundary starts, reuses, reports, and cleanly shuts down", async () => {
  const fixture = await createFirstmateFixture("extension-smoke");
  const pi = fakePi();
  const notices = [];
  const previous = {
    FM_HOME: process.env.FM_HOME,
    FM_ROOT_OVERRIDE: process.env.FM_ROOT_OVERRIDE,
    AI_DASHBOARD_PORT: process.env.AI_DASHBOARD_PORT,
    AI_DASHBOARD_NO_OPEN: process.env.AI_DASHBOARD_NO_OPEN,
  };
  Object.assign(process.env, {
    FM_HOME: fixture.home,
    FM_ROOT_OVERRIDE: fixture.root,
    AI_DASHBOARD_PORT: "0",
    AI_DASHBOARD_NO_OPEN: "1",
  });
  try {
    aiDashboardExtension(pi);
    const ctx = { cwd: fixture.home, hasUI: true, ui: { notify(message, level) { notices.push({ message, level }); } } };
    const first = await pi.commands.get("aidashboard").handler("", ctx);
    const second = await pi.commands.get("aidashboard").handler("", ctx);
    assert.match(first.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.equal(second.url, first.url);
    assert.equal(second.reused, true);
    assert.equal((await fetch(`${first.url}api/health`)).status, 200);
    assert.equal(notices.some((notice) => notice.message.includes(first.url)), true);
    await pi.handlers.get("session_shutdown")({ reason: "quit" }, ctx);
    await assert.rejects(fetch(`${first.url}api/health`));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fixture.cleanup();
  }
});
