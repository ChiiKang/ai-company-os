#!/usr/bin/env node
import { getOrStartDashboard } from "../extensions/ai-dashboard/lib/dashboard-server.js";

const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== "--port" || !args[1])) {
  throw new Error("Usage: node scripts/run-dashboard.mjs [--port PORT]");
}

const result = await getOrStartDashboard({
  fmHome: process.env.FM_HOME,
  firstmateRoot: process.env.FM_ROOT_OVERRIDE,
  cwd: process.cwd(),
  port: args[1] ?? process.env.AI_DASHBOARD_PORT,
});

process.stdout.write(`${result.url}\n`);

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  if (result.owned && result.instance) await result.instance.close();
  process.exit(0);
}

process.once("SIGINT", close);
process.once("SIGTERM", close);
