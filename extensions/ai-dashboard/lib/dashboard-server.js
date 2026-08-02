import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { EventBroker } from "./event-broker.js";
import { FirstmateAdapter, resolveFirstmateIntegration } from "./firstmate-adapter.js";
import { FleetBridge } from "./fleet-bridge.js";

const PRODUCT_ID = "ai-company-dashboard";
const PROTOCOL_VERSION = 1;
const DEFAULT_PORT = 4111;
const LOOPBACK = "127.0.0.1";
const ASSET_LIMIT = 512 * 1024;

let singleton = null;

export async function getOrStartDashboard(options = {}) {
  if (singleton && !singleton.closed) {
    return { instance: singleton, url: singleton.url, owned: true, reused: true };
  }

  const resolution = options.resolution ?? await resolveFirstmateIntegration(options);
  const adapter = options.adapter ?? new FirstmateAdapter(resolution, options.adapterOptions);
  const port = parsePort(options.port ?? process.env.AI_DASHBOARD_PORT ?? DEFAULT_PORT);
  const instance = new DashboardServer({ ...options, adapter, port });
  try {
    await instance.start();
    singleton = instance;
    return { instance, url: instance.url, owned: true, reused: false };
  } catch (error) {
    await instance.close();
    if (error?.code !== "EADDRINUSE" || port === 0) throw error;
    const existing = await probeExistingDashboard(port, adapter.homeId);
    if (existing) return { instance: null, url: existing.url, owned: false, reused: true };
    const conflict = new Error(`Port ${port} is already in use by another local service. Set AI_DASHBOARD_PORT to a free loopback port.`);
    conflict.code = "PORT_CONFLICT";
    throw conflict;
  }
}

export async function stopDashboard() {
  if (!singleton) return;
  const current = singleton;
  singleton = null;
  await current.close();
}

export class DashboardServer {
  constructor({ adapter, port = DEFAULT_PORT, host = LOOPBACK, brokerOptions = {}, bridgeOptions = {}, assetsDir } = {}) {
    if (host !== LOOPBACK) throw new Error("The AI dashboard may only bind to 127.0.0.1.");
    this.adapter = adapter;
    this.port = parsePort(port);
    this.host = LOOPBACK;
    this.assetsDir = assetsDir ?? fileURLToPath(new URL("../public/", import.meta.url));
    this.broker = new EventBroker(brokerOptions);
    this.bridge = new FleetBridge({ adapter, broker: this.broker, ...bridgeOptions });
    this.server = null;
    this.address = null;
    this.url = null;
    this.closed = false;
    this.startedAt = new Date().toISOString();
    this.ready = Promise.resolve();
    this.assets = new Map();
  }

  async start() {
    if (this.server) return this;
    await this.#loadAssets();
    this.server = createServer((request, response) => this.#handle(request, response));
    this.server.requestTimeout = 10_000;
    this.server.headersTimeout = 12_000;
    this.server.keepAliveTimeout = 5_000;
    this.server.maxHeadersCount = 48;

    await new Promise((resolve, reject) => {
      const onError = (error) => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off("error", onError);
        resolve();
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen({ host: this.host, port: this.port, exclusive: true });
    });

    this.address = this.server.address();
    this.port = this.address.port;
    this.url = `http://${this.host}:${this.port}/`;
    this.ready = this.bridge.start().catch((error) => {
      this.broker.publish("bridge.error", { message: error?.message || "Fleet bridge failed to start." });
    });
    return this;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.bridge.close();
    this.broker.close();
    const server = this.server;
    this.server = null;
    if (singleton === this) singleton = null;
    if (!server) return;
    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
      setTimeout(resolve, 1_000).unref?.();
    });
  }

  health() {
    return {
      product: PRODUCT_ID,
      protocol: PROTOCOL_VERSION,
      status: this.closed ? "closed" : "ok",
      homeId: this.adapter.homeId,
      host: this.host,
      port: this.port,
      startedAt: this.startedAt,
      events: this.broker.snapshotStats(),
    };
  }

  async #loadAssets() {
    const entries = [
      ["/", "index.html", "text/html; charset=utf-8"],
      ["/assets/styles.css", "styles.css", "text/css; charset=utf-8"],
      ["/assets/app.js", "app.js", "text/javascript; charset=utf-8"],
      ["/assets/app-core.js", "app-core.js", "text/javascript; charset=utf-8"],
    ];
    for (const [route, filename, contentType] of entries) {
      const buffer = await readFile(path.join(this.assetsDir, filename));
      if (buffer.length > ASSET_LIMIT) throw new Error(`${filename} exceeds the 512 KiB per-asset limit.`);
      this.assets.set(route, { buffer, contentType });
    }
  }

  #handle(request, response) {
    try {
      if (!this.#validHost(request) || !this.#validOrigin(request)) return this.#send(response, 403, "text/plain; charset=utf-8", "Loopback origin required.\n");
      const method = request.method ?? "GET";
      if (!new Set(["GET", "HEAD"]).has(method)) {
        response.setHeader("Allow", "GET, HEAD");
        return this.#send(response, 405, "text/plain; charset=utf-8", "Read-only endpoint.\n");
      }
      const rawTarget = request.url ?? "/";
      if (hasTraversal(rawTarget)) return this.#send(response, 400, "text/plain; charset=utf-8", "Invalid path.\n");
      const url = new URL(rawTarget, this.url ?? `http://${this.host}:${this.port}`);
      const pathname = url.pathname;

      if (pathname === "/api/health") return this.#sendJson(response, 200, this.health(), method === "HEAD");
      if (pathname === "/api/snapshot") return this.#sendJson(response, 200, this.bridge.snapshot(), method === "HEAD");
      if (pathname === "/events") {
        if (method === "HEAD") return this.#send(response, 405, "text/plain; charset=utf-8", "SSE requires GET.\n");
        return this.#openEventStream(request, response);
      }
      const asset = this.assets.get(pathname);
      if (asset) return this.#send(response, 200, asset.contentType, method === "HEAD" ? Buffer.alloc(0) : asset.buffer, asset.buffer.length);
      return this.#send(response, 404, "text/plain; charset=utf-8", "Not found.\n");
    } catch {
      return this.#send(response, 500, "text/plain; charset=utf-8", "Local dashboard error.\n");
    }
  }

  #openEventStream(request, response) {
    const headers = securityHeaders("text/event-stream; charset=utf-8");
    Object.assign(headers, {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.writeHead(200, headers);
    response.flushHeaders?.();
    const connected = this.broker.connect(response, {
      lastEventId: request.headers["last-event-id"],
      snapshot: this.bridge.snapshot(),
    });
    if (!connected) {
      response.end();
    }
  }

  #validHost(request) {
    const host = String(request.headers.host ?? "").toLowerCase();
    return host === this.host || host === "localhost" || host === `${this.host}:${this.port}` || host === `localhost:${this.port}`;
  }

  #validOrigin(request) {
    const origin = request.headers.origin;
    if (!origin) return true;
    return origin === `http://${this.host}:${this.port}` || origin === `http://localhost:${this.port}`;
  }

  #sendJson(response, status, value, head = false) {
    const body = Buffer.from(JSON.stringify(value));
    if (body.length > 512 * 1024) return this.#send(response, 503, "application/json; charset=utf-8", JSON.stringify({ error: "Snapshot exceeded its bounded response size." }));
    return this.#send(response, status, "application/json; charset=utf-8", head ? Buffer.alloc(0) : body, body.length);
  }

  #send(response, status, contentType, body, contentLength = null) {
    if (response.headersSent || response.writableEnded) return;
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    const headers = securityHeaders(contentType);
    headers["Content-Length"] = String(contentLength ?? payload.length);
    response.writeHead(status, headers);
    response.end(payload);
  }
}

export async function openDashboardURL(url, { disabled = false, platform = process.platform, spawnImpl = spawn, timeoutMs = 5_000 } = {}) {
  if (disabled || process.env.AI_DASHBOARD_NO_OPEN === "1") return { opened: false, reason: "disabled" };
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  return new Promise((resolve) => {
    let child;
    let settled = false;
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    try {
      child = spawnImpl(command, args, { stdio: "ignore", shell: false, windowsHide: true });
    } catch (error) {
      return finish({ opened: false, reason: error.message });
    }
    child.once("error", (error) => finish({ opened: false, reason: error.message }));
    child.once("close", (code) => finish({ opened: code === 0, reason: code === 0 ? null : `browser opener exited ${code}` }));
    timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      finish({ opened: false, reason: "browser opener timed out" });
    }, Math.max(10, Math.min(10_000, Number(timeoutMs) || 5_000)));
  });
}

async function probeExistingDashboard(port, homeId) {
  const url = `http://${LOOPBACK}:${port}/api/health`;
  try {
    const response = await fetch(url, { headers: { Host: `${LOOPBACK}:${port}` }, signal: AbortSignal.timeout(800) });
    if (!response.ok) return null;
    const health = await response.json();
    if (health.product !== PRODUCT_ID || health.protocol !== PROTOCOL_VERSION || health.homeId !== homeId) return null;
    return { url: `http://${LOOPBACK}:${port}/` };
  } catch {
    return null;
  }
}

function parsePort(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 65_535) throw new Error("AI_DASHBOARD_PORT must be an integer from 0 to 65535.");
  return parsed;
}

function hasTraversal(rawTarget) {
  let decoded;
  try { decoded = decodeURIComponent(rawTarget); } catch { return true; }
  return decoded.includes("\\") || decoded.split(/[/?#]/).includes("..") || /%2e|%5c/i.test(rawTarget);
}

function securityHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Permitted-Cross-Domain-Policies": "none",
    "X-AI-Company-Dashboard": "1",
  };
}
