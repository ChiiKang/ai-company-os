import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function createFirstmateFixture(name = "dashboard-test") {
  const base = await mkdtemp(path.join(os.tmpdir(), `${name}-`));
  const home = path.join(base, "home");
  const root = path.join(base, "firstmate-code");
  await Promise.all([
    mkdir(path.join(home, "state"), { recursive: true }),
    mkdir(path.join(home, "data"), { recursive: true }),
    mkdir(path.join(home, "projects", "alpha"), { recursive: true }),
    mkdir(path.join(root, "bin"), { recursive: true }),
  ]);
  const crewStateScript = path.join(root, "bin", "fm-crew-state.sh");
  await writeFile(crewStateScript, `#!/bin/sh
set -eu
id=\${1:?}
file=\${FM_STATE_OVERRIDE:?}/\${id}.current
if [ -f "$file" ]; then
  head -n 1 "$file"
else
  printf '%s\\n' 'state: unknown · source: none · no current-state source available'
fi
`);
  await chmod(crewStateScript, 0o755);

  const fixture = {
    base,
    home,
    root,
    stateDir: path.join(home, "state"),
    dataDir: path.join(home, "data"),
    crewStateScript,
    async addTask(id, { state = "working", source = "pane", detail = "harness busy", kind = "ship", project = "alpha", status = "working: implementation underway" } = {}) {
      await mkdir(path.join(home, "projects", project), { recursive: true });
      await writeFile(path.join(home, "state", `${id}.meta`), [
        `window=fm-${id}`,
        `worktree=${path.join(home, "projects", project)}`,
        `project=${path.join(home, "projects", project)}`,
        "harness=pi",
        `kind=${kind}`,
        "mode=no-mistakes",
        `tasktmp=${path.join(home, "private", "captain-prompt.md")}`,
        `raw_secret=${["ghp", "THIS_VALUE_MUST_NEVER_APPEAR_1234567890"].join("_")}`,
        "",
      ].join("\n"));
      await writeFile(path.join(home, "state", `${id}.status`), `${status}\n`);
      await writeFile(path.join(home, "state", `${id}.current`), `state: ${state} · source: ${source} · ${detail}\n`);
    },
    async removeTask(id) {
      await Promise.all([
        rm(path.join(home, "state", `${id}.meta`), { force: true }),
        rm(path.join(home, "state", `${id}.status`), { force: true }),
        rm(path.join(home, "state", `${id}.current`), { force: true }),
      ]);
    },
    async writeBacklog(records = []) {
      const sections = { in_flight: [], queued: [], done: [] };
      for (const record of records) sections[record.state].push(`- [${record.state === "done" ? "x" : " "}] ${record.id} - ${record.title} (repo: ${record.repo || "alpha"}) (kind: ${record.kind || "ship"})${record.blockedBy ? ` blocked-by: ${record.blockedBy}` : ""}`);
      await writeFile(path.join(home, "data", "backlog.md"), `## In flight\n${sections.in_flight.join("\n")}\n\n## Queued\n${sections.queued.join("\n")}\n\n## Done\n${sections.done.join("\n")}\n`);
    },
    async cleanup() { await rm(base, { recursive: true, force: true }); },
  };

  await fixture.writeBacklog([
    { id: "alpha-task", title: "Build bounded local telemetry", state: "in_flight", repo: "alpha" },
    { id: "queued-task", title: "Verify reconnect behavior", state: "queued", repo: "alpha" },
  ]);
  await fixture.addTask("alpha-task");
  return fixture;
}

export async function waitFor(predicate, { timeoutMs = 4_000, intervalMs = 25, message = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${message}${lastError ? `: ${lastError.message}` : ""}`);
}

export async function readSseUntil(url, predicate, { headers = {}, timeoutMs = 5_000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(url, { headers, signal: controller.signal });
  if (!response.ok) throw new Error(`SSE returned ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
        if (!data) continue;
        const event = JSON.parse(data);
        if (predicate(event)) return event;
      }
    }
  } finally {
    clearTimeout(timeout);
    controller.abort();
    await reader.cancel().catch(() => {});
  }
  throw new Error("SSE ended before matching event");
}
