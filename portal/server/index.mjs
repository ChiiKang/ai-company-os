/**
 * EnergyEngine portal API server (dependency-light Node, ESM).
 *
 *   node server/index.mjs            → serves ./dist and /api/* on :8787
 *   ANTHROPIC_API_KEY=<key>          → /api/agent/chat streams Claude replies
 *   (no key)                         → /api/agent/health reports llm:false and the
 *                                      browser falls back to the local agent brain
 *
 * The Vite dev server proxies /api to this process (see vite.config.ts).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, "..", "dist");
const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.EE_AGENT_MODEL || "claude-opus-5";
const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let anthropic = null;
if (HAS_KEY) {
  try {
    const mod = await import("@anthropic-ai/sdk");
    const Anthropic = mod.default;
    anthropic = new Anthropic();
  } catch (err) {
    console.warn("[portal-api] @anthropic-ai/sdk not installed; falling back to local agent.", err?.message);
  }
}

const SYSTEM_PROMPT = `You are the Agent Command Center for EnergyEngine.ai, an AI sales operations system for solar and home-energy businesses.
You command five workflows: Generate Leads, Set Appointments, Recover Cancels, Generate Referrals, Recruit Talent.
You speak to the business owner. Be direct, specific and short. Use the portal snapshot (leads, activity, stats, wallet, settings) to ground every answer in real data; never invent leads or numbers that are not in the snapshot.
When the owner asks you to run a workflow, confirm what you will do in 3-5 bullet points (channels, contact hours, offer, first touch) and include a JSON block at the very end of your reply, on its own line, of the form:
<effects>[{"type":"start_workflow","workflow":"set_appointments","leadId":"PA-310826"}]</effects>
Only include leadId when a specific lead is in context or named. Omit the <effects> block entirely when no workflow should start.
If setup is incomplete (missing phone, no active markets, no agent voice), say so in one line and still queue the workflow.
Format with short paragraphs and "- " bullet lines. Use **bold** for names and numbers. No headings.`;

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 2_000_000) reject(new Error("payload too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function parseEffects(text) {
  const m = text.match(/<effects>([\s\S]*?)<\/effects>/);
  if (!m) return { content: text.trim(), effects: [] };
  let effects = [];
  try {
    effects = JSON.parse(m[1]);
  } catch {
    effects = [];
  }
  return { content: text.replace(m[0], "").trim(), effects: Array.isArray(effects) ? effects : [] };
}

async function handleChat(req, res) {
  const raw = await readBody(req);
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return json(res, 400, { error: "invalid json" });
  }
  const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()) : [];
  if (!messages.length || messages[0].role !== "user") return json(res, 400, { error: "messages must start with a user turn" });
  if (!anthropic) return json(res, 503, { error: "llm not configured" });

  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  const contextText = [
    body.context?.leadId ? `A lead is in context: ${body.context.leadId}.` : "",
    body.context?.workflow ? `The owner pre-selected the workflow: ${body.context.workflow}.` : "",
    `Portal snapshot (JSON):\n${JSON.stringify(body.snapshot ?? {}, null, 0)}`,
  ].filter(Boolean).join("\n");

  try {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: contextText },
      ],
      messages,
    });
    let full = "";
    let visible = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        full += event.delta.text;
        // Hold back anything after an <effects> tag so the UI never shows it.
        const cut = full.indexOf("<effects>");
        const shown = cut >= 0 ? full.slice(0, cut) : full;
        if (shown.length > visible.length) {
          send({ type: "delta", text: shown.slice(visible.length) });
          visible = shown;
        }
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      send({ type: "done", reply: { content: visible || "I can't help with that request." } });
    } else {
      const { content, effects } = parseEffects(full);
      const cards = effects.filter((e) => e.type === "start_workflow").map((e) => ({ type: "workflow_started", workflow: e.workflow, leadId: e.leadId }));
      send({ type: "done", reply: { content, cards, effects } });
    }
  } catch (err) {
    send({ type: "error", error: err?.message || "agent error" });
  }
  res.end();
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };

function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(DIST)) return json(res, 403, { error: "forbidden" });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  if (!fs.existsSync(file)) return json(res, 404, { error: "build the portal first: npm run build" });
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": file.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable" });
  fs.createReadStream(file).pipe(res);
}

http
  .createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/api/agent/health")) return json(res, 200, { ok: true, llm: Boolean(anthropic), model: anthropic ? MODEL : null });
      if (req.url.startsWith("/api/agent/chat") && req.method === "POST") return await handleChat(req, res);
      if (req.url.startsWith("/api/")) return json(res, 404, { error: "not found" });
      return serveStatic(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) json(res, 500, { error: "server error" });
      else res.end();
    }
  })
  .listen(PORT, () => {
    console.log(`[portal-api] listening on http://localhost:${PORT} · llm=${anthropic ? MODEL : "off (local agent)"}`);
  });
