/** @typedef {import("@earendil-works/pi-coding-agent").ExtensionAPI} ExtensionAPI */

import { getOrStartDashboard, openDashboardURL } from "./lib/dashboard-server.js";

/**
 * Register the read-only /aidashboard command. The factory only registers hooks;
 * no server, watcher, timer, or child process starts before command invocation.
 *
 * @param {ExtensionAPI} pi
 */
export default function aiDashboardExtension(pi) {
  let ownedInstance = null;

  pi.registerCommand("aidashboard", {
    description: "Open the local read-only AI Company fleet dashboard",
    handler: async (_args, ctx) => {
      try {
        const result = await getOrStartDashboard({
          fmHome: process.env.FM_HOME,
          firstmateRoot: process.env.FM_ROOT_OVERRIDE,
          cwd: ctx.cwd,
          port: process.env.AI_DASHBOARD_PORT,
        });
        if (result.owned && result.instance) ownedInstance = result.instance;
        const action = result.reused ? "Dashboard ready (reused)" : "Dashboard ready";
        ctx.ui.notify(`${action}: ${result.url}`, "info");
        if (!ctx.hasUI) process.stderr.write(`${action}: ${result.url}\n`);

        const opened = await openDashboardURL(result.url);
        if (!opened.opened && opened.reason !== "disabled") {
          ctx.ui.notify(`Open this URL in a browser: ${result.url}`, "warning");
        }
        return { url: result.url, reused: result.reused };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`AI dashboard could not start: ${message}`, "error");
        if (!ctx.hasUI) process.stderr.write(`AI dashboard could not start: ${message}\n`);
        return { error: message };
      }
    },
  });

  pi.on("session_shutdown", async () => {
    const instance = ownedInstance;
    ownedInstance = null;
    if (instance) await instance.close();
  });
}

export { getOrStartDashboard } from "./lib/dashboard-server.js";
