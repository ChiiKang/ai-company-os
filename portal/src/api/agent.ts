import type { AgentAdapter, AgentContext, AgentReply, AgentSnapshot, ChatCard, ChatMessage, Lead, WorkflowKind } from "@/types";
import { WORKFLOWS, WORKFLOW_BY_KIND } from "@/data/workflows";
import { formatMoney, formatNumber, fullName, timeAgo } from "@/lib/format";

/**
 * FROZEN AGENT CONTRACT (Wave 0).
 * `resolveAgent()` returns the remote Claude-backed adapter when the API server
 * reports a configured key, otherwise the deterministic local brain. Both
 * implement `AgentAdapter` so the chat UI never changes.
 */

/* ------------------------------------------------------------------ */
/* Local brain: deterministic, offline, instant                         */
/* ------------------------------------------------------------------ */

const WORKFLOW_PATTERNS: Array<[WorkflowKind, RegExp]> = [
  ["generate_leads", /\b(generate|find|get|new)\b.*\blead/i],
  ["set_appointments", /\b(appointment|book|schedule|consult)/i],
  ["recover_cancels", /\b(cancel|recover|win ?back|churn)/i],
  ["generate_referrals", /\breferr?al/i],
  ["recruit_talent", /\b(recruit|hire|talent|closer|installer|interview)/i],
];

function detectWorkflow(text: string, ctx: AgentContext): WorkflowKind | undefined {
  if (ctx.workflow) return ctx.workflow;
  for (const [kind, re] of WORKFLOW_PATTERNS) if (re.test(text)) return kind;
  return undefined;
}

function findLeadByName(text: string, leads: Lead[]): Lead | undefined {
  const lower = text.toLowerCase();
  return leads.find((l) => lower.includes(fullName(l).toLowerCase())) ?? leads.find((l) => new RegExp(`\\b${l.lastName.toLowerCase()}\\b`).test(lower) && l.lastName.length > 2);
}

function describeLead(l: Lead): string {
  const wf = l.workflows[0];
  const lines = [
    `**${fullName(l)}** · ${l.city}, ${l.state} · Lead ID ${l.id}`,
    `Status: ${l.status.replace(/_/g, " ")} · Source: ${l.source} · Last reached ${timeAgo(l.lastReachedAt)}`,
  ];
  if (l.systemSizeKw) lines.push(`System size on file: ${l.systemSizeKw} kW`);
  if (l.notes) lines.push(`Notes: ${l.notes}`);
  if (wf) {
    lines.push(`Latest workflow: ${wf.label} (${wf.status.replace(/_/g, " ")}) · ${wf.calls.length} calls, ${wf.sms.length} texts, ${wf.emails.length} emails`);
    if (wf.summary) lines.push(`Summary: ${wf.summary}`);
  }
  return lines.join("\n");
}

async function streamText(text: string, onDelta: (t: string) => void, signal?: AbortSignal): Promise<void> {
  const words = text.split(/(\s+)/);
  for (const w of words) {
    if (signal?.aborted) return;
    onDelta(w);
    await new Promise((r) => setTimeout(r, w.trim() ? 14 : 0));
  }
}

export const localAgent: AgentAdapter = {
  name: "EnergyEngine local agent",
  async send({ messages, context, snapshot }, onDelta, signal) {
    const last = messages.filter((m) => m.role === "user").at(-1);
    const text = last?.content.trim() ?? "";
    const reply = composeLocalReply(text, context, snapshot);
    await streamText(reply.content, onDelta, signal);
    return reply;
  },
};

function composeLocalReply(text: string, ctx: AgentContext, snap: AgentSnapshot): AgentReply {
  const lead = (ctx.leadId ? snap.leads.find((l) => l.id === ctx.leadId) : undefined) ?? findLeadByName(text, snap.leads);
  const name = snap.settings.business.preferredName || snap.user.name.split(" ")[0];
  const cards: ChatCard[] = [];
  const workflow = detectWorkflow(text, ctx);
  const lower = text.toLowerCase();

  /* Stats / performance */
  if (/\b(stats|performance|how (am|are) (i|we) doing|numbers|kpi|report|dashboard)\b/.test(lower)) {
    const s = snap.stats;
    const line = s.map((x) => `${x.label}: **${formatNumber(x.value)}** (${x.deltaPct >= 0 ? "+" : ""}${x.deltaPct}%)`).join(" · ");
    cards.push({ type: "stats", range: "all" });
    return { content: `Here's where you stand, ${name}.\n\n${line}\n\nAppointments are compounding fastest. Referrals are down 10%, so I'd suggest running the Referral Engine against everyone installed this year.`, cards: [...cards, { type: "actions", actions: [{ label: "Run referral campaign", prompt: WORKFLOW_BY_KIND.generate_referrals.examplePrompt }, { label: "Show recent activity", prompt: "Show me recent activity" }] }] };
  }

  /* Wallet */
  if (/\b(wallet|credit|balance|usdc|billing|invoice|plan)\b/.test(lower)) {
    const w = snap.wallet;
    return {
      content: `Your **${w.plan.toUpperCase()}** plan renews ${new Date(w.renewsAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}. You have **${formatMoney(w.creditsUsd)}** in usage credits${w.advancedMode ? ` and **${formatMoney(w.usdcBalance, "USDC")}** for agentic commerce tools` : ""}.\n\n${w.advancedMode ? "Advanced mode is on, so your agents can pay for open commerce tools directly." : "Turn on **Advanced mode** in the Wallet and fund it with USDC to unlock open agentic commerce tools for your agents."}`,
      cards: [{ type: "actions", actions: [{ label: "Open wallet", prompt: "/wallet" }] }],
    };
  }

  /* Recent activity */
  if (/\b(activity|recent|what happened|update me|latest)\b/.test(lower) && !workflow) {
    const items = snap.activity.slice(0, 5).map((a) => `- ${a.title} · ${timeAgo(a.at)}`).join("\n");
    return { content: `Latest across your workflows:\n\n${items}\n\nWant me to dig into any of these?`, cards: snap.activity.slice(0, 3).filter((a) => a.leadId).map((a) => ({ type: "lead", leadId: a.leadId! })) };
  }

  /* Lead lookup */
  if (lead && !workflow) {
    return { content: describeLead(lead), cards: [{ type: "lead", leadId: lead.id }, { type: "actions", actions: WORKFLOWS.slice(1, 4).map((w) => ({ label: w.label, prompt: w.leadPrompt.replace("{name}", fullName(lead)) })) }] };
  }

  /* Workflow start */
  if (workflow) {
    const def = WORKFLOW_BY_KIND[workflow];
    const gate = missingSetup(snap);
    const target = lead ? ` for **${fullName(lead)}**` : ` across ${snap.settings.business.activeMarkets.length ? `${snap.settings.business.activeMarkets.length} active markets` : "your active markets"}`;
    const hours = snap.settings.notifications.businessHours;
    const window = `${to12(hours.mon.open)}–${to12(hours.mon.close)} local lead time`;
    const content = [
      `On it. Starting **${def.label}**${target}.`,
      "",
      `- Channels: voice, SMS and email inside ${window}`,
      lead ? `- First touch: call ${lead.firstName} now, text fallback in 15 minutes` : "- First touch: qualify, then hand warm leads to the Appointment Setter",
      snap.settings.business.promotions.length ? `- Offer: ${snap.settings.business.promotions[0].text}` : "- Offer: none configured yet (add one under Settings → Business Profile → Active Promotions)",
      "",
      gate ? `Heads up: ${gate} I'll queue the workflow and start the moment that's done.` : "I'll post progress here and in Activity as it happens.",
    ].join("\n");
    return {
      content,
      cards: [{ type: "workflow_started", workflow, leadId: lead?.id }],
      effects: [{ type: "start_workflow", workflow, leadId: lead?.id }],
    };
  }

  /* Greeting / fallback */
  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/.test(lower) || text.length < 4) {
    return { content: `Hi ${name}. I run your sales agents. Pick a workflow above or tell me what you want done, for example “book consultations with everyone I haven't reached this week”.` };
  }
  return {
    content: `I can do that. To be precise, tell me which workflow to run and who it targets. I currently know **${formatNumber(snap.leads.length)}** leads and **${WORKFLOWS.length}** workflows.\n\nExamples:\n- “${WORKFLOW_BY_KIND.set_appointments.examplePrompt}”\n- “${WORKFLOW_BY_KIND.recover_cancels.examplePrompt}”\n- “Show me Carl Cox”`,
    cards: [{ type: "actions", actions: WORKFLOWS.slice(0, 3).map((w) => ({ label: w.label, prompt: w.examplePrompt })) }],
  };
}

function missingSetup(snap: AgentSnapshot): string | null {
  const b = snap.settings.business;
  if (!b.phone) return "your phone number is missing in Business Profile, so appointment confirmations have nowhere to land.";
  if (!b.activeMarkets.length) return "no active markets are selected yet in Business Profile → Markets.";
  if (!snap.settings.agent.voice) return "no agent voice is selected yet in Settings → Agent Profile.";
  return null;
}

function to12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = ((h + 11) % 12) + 1;
  return m ? `${hour}:${m.toString().padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

/* ------------------------------------------------------------------ */
/* Remote adapter: streams from the Node API server (Claude-backed)     */
/* ------------------------------------------------------------------ */

export const remoteAgent: AgentAdapter = {
  name: "EnergyEngine agent (Claude)",
  async send({ messages, context, snapshot }, onDelta, signal) {
    const res = await fetch("/api/agent/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        context,
        snapshot: compactSnapshot(snapshot),
      }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`Agent request failed (${res.status})`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let reply: AgentReply | null = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const payload = JSON.parse(line.slice(6)) as { type: string; text?: string; reply?: AgentReply; error?: string };
        if (payload.type === "delta" && payload.text) {
          full += payload.text;
          onDelta(payload.text);
        } else if (payload.type === "done" && payload.reply) {
          reply = payload.reply;
        } else if (payload.type === "error") {
          throw new Error(payload.error ?? "Agent error");
        }
      }
    }
    return reply ?? { content: full };
  },
};

function compactSnapshot(s: AgentSnapshot) {
  return {
    user: { name: s.user.name, email: s.user.email, plan: s.user.plan },
    leads: s.leads.slice(0, 60).map((l) => ({ id: l.id, name: fullName(l), city: l.city, state: l.state, status: l.status, lastReachedAt: l.lastReachedAt, notes: l.notes, workflow: l.workflows[0]?.label, workflowStatus: l.workflows[0]?.status })),
    activity: s.activity.slice(0, 10).map((a) => ({ at: a.at, title: a.title, lines: a.lines })),
    stats: s.stats.map((x) => ({ label: x.label, value: x.value, deltaPct: x.deltaPct })),
    wallet: { plan: s.wallet.plan, creditsUsd: s.wallet.creditsUsd, usdcBalance: s.wallet.usdcBalance, advancedMode: s.wallet.advancedMode },
    settings: {
      business: { companyName: s.settings.business.companyName, bio: s.settings.business.companyBio, promotions: s.settings.business.promotions.map((p) => p.text), activeMarkets: s.settings.business.activeMarkets, targetMarkets: s.settings.business.targetMarkets, referralBudget: [s.settings.business.referralBudgetMin, s.settings.business.referralBudgetMax] },
      hours: s.settings.notifications.businessHours,
      timezone: s.settings.notifications.timezone,
      agent: { voice: s.settings.agent.voice, languages: s.settings.agent.languages },
    },
    workflows: WORKFLOWS.map((w) => ({ kind: w.kind, label: w.label, description: w.description })),
  };
}

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

let resolved: Promise<AgentAdapter> | null = null;

export function resolveAgent(): Promise<AgentAdapter> {
  if (!resolved) {
    resolved = (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch("/api/agent/health", { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) {
          const j = (await res.json()) as { llm?: boolean };
          if (j.llm) return remoteAgent;
        }
      } catch {
        /* no API server: fall back */
      }
      return localAgent;
    })();
  }
  return resolved;
}

export function newMessage(role: ChatMessage["role"], content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: `${role}_${Math.random().toString(36).slice(2, 9)}`, role, content, at: new Date().toISOString(), status: "done", ...extra };
}
