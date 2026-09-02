/**
 * Local support knowledge base. Answered instantly in the browser — no network.
 * `answer` is markdown-lite: blank-line paragraphs, "- " bullets, **bold**.
 */

export interface KbEntry {
  id: string;
  question: string;
  keywords: string[];
  answer: string;
  relatedRoute?: { path: string; label: string };
  /** Surfaces this entry in the FAQ accordion. */
  faq?: boolean;
}

export const KB: KbEntry[] = [
  {
    id: "generate-leads",
    question: "How does the Generate Leads workflow work?",
    keywords: ["generate", "leads", "lead", "find", "prospect", "homeowner", "qualify", "qualified", "sourcing"],
    answer:
      "**Generate Leads** scans your active markets for homeowners who match your ideal customer, then qualifies them by phone, text and email before handing them to your Appointment Setter.\n\n- Runs only inside the markets you select in Business Profile\n- Each lead is scored on roof suitability, utility rate and ownership\n- Warm leads land in Activity with a full transcript\n\nStart it from the Command Center by clicking the **Generate Leads** chip and describing what you want.",
    relatedRoute: { path: "/?workflow=generate_leads", label: "Command Center" },
  },
  {
    id: "set-appointments",
    question: "How does the Set Appointments workflow work?",
    keywords: ["set", "appointments", "appointment", "book", "booking", "schedule", "consultation", "consult", "setter"],
    answer:
      "**Set Appointments** calls, texts and emails a lead inside your contact hours until a consultation is booked on your calendar.\n\n- The agent offers times straight from your connected calendar\n- Confirmation goes out by SMS and email, with a reminder the day before\n- If a lead goes quiet, the agent waits a day and tries a different channel\n\nEvery attempt is logged under the lead in Activity.",
    relatedRoute: { path: "/activity", label: "Activity" },
  },
  {
    id: "recover-cancels",
    question: "How does the Recover Cancels workflow work?",
    keywords: ["recover", "cancels", "cancelled", "canceled", "cancellation", "churn", "win", "back", "cold", "lost"],
    answer:
      "**Recover Cancels** re-engages customers who cancelled or went cold. The agent listens for the real objection — price, timing, trust — and answers it with your current promotion or financing option.\n\n- Uses the empathetic tone by default (Jessica), which you can change in Agent Profile\n- Never promises anything outside the products, warranties and promotions you set in Business Profile\n- A recovered project shows up as **Cancel Recovered** in your stats",
    relatedRoute: { path: "/settings/business", label: "Business Profile" },
  },
  {
    id: "generate-referrals",
    question: "How does the Generate Referrals workflow work?",
    keywords: ["generate", "referrals", "referral", "refer", "bonus", "happy", "customers", "reward"],
    answer:
      "**Generate Referrals** asks your happy customers for introductions and offers the referral bonus you set in Business Profile.\n\n- The agent only reaches out after an install is complete\n- Referred homeowners are created as new leads with the referrer noted\n- Payouts stay inside the min–max budget you configured",
    relatedRoute: { path: "/settings/business", label: "Business Profile" },
  },
  {
    id: "recruit-talent",
    question: "How does the Recruit Talent workflow work?",
    keywords: ["recruit", "talent", "hire", "hiring", "closer", "closers", "installer", "installers", "interview", "candidates", "rep", "reps"],
    answer:
      "**Recruit Talent** sources, screens and schedules interviews with sales reps and installers in your markets.\n\n- Tell the agent the role, market and must-haves in plain English\n- Candidates are screened by phone with a short structured interview\n- Interview slots come from your connected calendar, just like appointments",
    relatedRoute: { path: "/?workflow=recruit_talent", label: "Command Center" },
  },
  {
    id: "contact-hours",
    question: "When do agents call, and how do they decide?",
    keywords: ["call", "calls", "calling", "decide", "when", "hours", "contact", "time", "times", "business", "weekends", "evening", "morning"],
    answer:
      "Agents only reach out inside the **business hours** you set in Notifications, translated to the lead's local time zone. Within that window the agent picks the channel most likely to get a reply.\n\n- First touch is usually a call; texts and emails follow if there's no answer\n- Weekends are included only if you enable them\n- Each lead is capped at a sensible number of touches per day so no one feels chased",
    relatedRoute: { path: "/settings/notifications", label: "Notifications" },
    faq: true,
  },
  {
    id: "opt-out",
    question: "How are opt-outs and STOP requests handled?",
    keywords: ["opt", "out", "opted", "stop", "unsubscribe", "compliance", "tcpa", "dnc", "do", "not", "consent", "legal", "spam"],
    answer:
      "Compliance is built in. If a lead says **STOP**, asks not to be contacted, or is on a do-not-call list, every workflow for that lead ends immediately and the lead is marked **Opted Out**.\n\n- Opt-outs apply across calls, SMS and email\n- Consent and opt-out events are timestamped in the lead's activity feed\n- Agents identify themselves as an AI assistant for your company on every call",
    relatedRoute: { path: "/activity", label: "Activity" },
    faq: true,
  },
  {
    id: "transcripts",
    question: "Where can I see call transcripts and messages?",
    keywords: ["transcript", "transcripts", "recording", "recordings", "conversation", "sms", "text", "messages", "email", "emails", "history", "see", "read"],
    answer:
      "Open any lead in **Activity** and expand Voice Calls, SMS Conversation or Email Conversation. Each call shows the outcome, duration and a full transcript; texts and emails appear as threads.\n\n- A summary at the top of each workflow recaps what happened\n- Transcripts are searchable from the Command Center — try \"what did Susan say about pricing?\"",
    relatedRoute: { path: "/activity", label: "Activity" },
    faq: true,
  },
  {
    id: "credits",
    question: "How do usage credits and pricing work?",
    keywords: ["usage", "credits", "credit", "pricing", "price", "cost", "costs", "charge", "charged", "bill", "billing", "pay", "plan", "subscription", "much"],
    answer:
      "Your **Pro plan** covers the platform. Agent activity draws down prepaid **usage credits** — roughly a few cents per text or email and a little more per minute of voice.\n\n- Every charge is itemised in the Wallet by lead and workflow\n- Credits never expire while your subscription is active\n- Buy more any time, or turn on Auto-reload so a busy week never stalls your agents",
    relatedRoute: { path: "/wallet", label: "Wallet" },
    faq: true,
  },
  {
    id: "advanced-mode",
    question: "What does Advanced mode with USDC unlock?",
    keywords: ["advanced", "mode", "usdc", "crypto", "stablecoin", "wallet", "agentic", "commerce", "unlock", "on-chain", "onchain", "tools"],
    answer:
      "**Advanced mode** lets your agents pay for open agentic-commerce tools on your behalf using **USDC** from your on-chain balance — things like premium data lookups, skip-tracing and third-party scheduling.\n\n- Toggle it on in the Wallet and fund a USDC balance\n- Every spend is a signed transaction you can audit line by line\n- Spend limits keep agents inside the budget you set\n\nIt's optional: everything core to the five workflows runs on regular usage credits.",
    relatedRoute: { path: "/wallet", label: "Wallet" },
    faq: true,
  },
  {
    id: "auto-reload",
    question: "How does Auto-reload work?",
    keywords: ["auto", "reload", "auto-reload", "autoreload", "automatic", "automatically", "top", "up", "topup", "low", "balance", "threshold"],
    answer:
      "**Auto-reload** buys credits automatically when your prepaid balance drops below a threshold you choose, using the payment method on file.\n\n- Default: reload $100 when the balance falls under $25\n- You'll get a receipt by email each time it fires\n- Turn it off any time from the Wallet",
    relatedRoute: { path: "/wallet", label: "Wallet" },
  },
  {
    id: "calendar",
    question: "How do I connect Google Calendar, Calendly or Teams?",
    keywords: ["connect", "google", "calendar", "calendly", "teams", "microsoft", "outlook", "sync", "integration", "integrations"],
    answer:
      "Go to **Settings → Notifications** and pick your calendar provider. Google Calendar, Calendly and Microsoft Teams are supported.\n\n- Authorise with the account you book consultations on\n- Agents read your free/busy and write confirmed appointments\n- Change or disconnect the provider any time — existing bookings stay put",
    relatedRoute: { path: "/settings/notifications", label: "Notifications" },
    faq: true,
  },
  {
    id: "video",
    question: "Which video platforms are supported?",
    keywords: ["video", "zoom", "meet", "google", "teams", "virtual", "link", "remote"],
    answer:
      "Zoom, Google Meet and Microsoft Teams. Pick one under **Settings → Notifications** and the agent will include a meeting link in every video consultation it books.",
    relatedRoute: { path: "/settings/notifications", label: "Notifications" },
  },
  {
    id: "voices",
    question: "Can I change my agent's voice?",
    keywords: ["voice", "voices", "sound", "sounds", "tone", "jarvis", "jessica", "jeremiah", "janice", "custom", "name", "persona"],
    answer:
      "Yes. In **Settings → Agent Profile** choose from Jarvis (persistent), Jeremiah (energetic), Jessica (empathetic) or Janice (curious) — or describe a custom voice and give your agent a name.\n\nYou can call your own test number to hear the result before going live.",
    relatedRoute: { path: "/settings/agent", label: "Agent Profile" },
    faq: true,
  },
  {
    id: "training",
    question: "How do I train my agent on my scripts?",
    keywords: ["train", "training", "teach", "script", "scripts", "upload", "documents", "photos", "videos", "knowledge", "learn"],
    answer:
      "Upload scripts, brochures, photos and videos in **Agent Profile → Training**. Agents use them for product facts, objection handling and tone.\n\n- PDFs, Word docs, images and short videos are all fine\n- Add free-text notes for the things you'd tell a new rep on day one\n- Changes apply to the next conversation each agent starts",
    relatedRoute: { path: "/settings/agent", label: "Agent Profile" },
  },
  {
    id: "languages",
    question: "Which languages do agents speak?",
    keywords: ["language", "languages", "spanish", "english", "bilingual", "speak", "español"],
    answer:
      "English and Spanish today, with the agent switching automatically when a lead replies in Spanish. Enable both under **Agent Profile → Languages**. More languages are on the roadmap.",
    relatedRoute: { path: "/settings/agent", label: "Agent Profile" },
  },
  {
    id: "markets",
    question: "How do active markets and target zones work?",
    keywords: ["markets", "market", "active", "target", "zone", "zones", "state", "states", "region", "territory", "zip", "utility", "area"],
    answer:
      "**Active markets** are the states or provinces your agents may operate in. **Target zones** narrow that to cities, zip codes or utility territories where you want leads first.\n\nBoth live under **Business Profile → Markets** and are required before Generate Leads can run.",
    relatedRoute: { path: "/settings/business", label: "Business Profile" },
  },
  {
    id: "timezone",
    question: "Which time zone do agents use?",
    keywords: ["timezone", "time", "zone", "zones", "local", "clock", "daylight"],
    answer:
      "Your business hours are defined in the time zone set under Notifications. When contacting a lead, the agent converts those hours into the **lead's** local time zone, so a Pacific homeowner is never called at 6 AM.",
    relatedRoute: { path: "/settings/notifications", label: "Notifications" },
  },
  {
    id: "pause",
    question: "Can I pause or stop a workflow?",
    keywords: ["pause", "paused", "stop", "halt", "resume", "workflow", "workflows", "running"],
    answer:
      "Yes. Open the lead in **Activity**, find the workflow and choose **Pause**; resume whenever you like. You can also tell the Command Center \"pause everything for Carl Cox\" and it will take care of it.\n\nPausing stops all outreach instantly — any scheduled call or message is dropped.",
    relatedRoute: { path: "/activity", label: "Activity" },
    faq: true,
  },
  {
    id: "cancel-plan",
    question: "How do I cancel my plan?",
    keywords: ["cancel", "plan", "subscription", "downgrade", "refund", "close", "account", "end"],
    answer:
      "Open the **Wallet** and choose Cancel under Cancellation. Your agents keep working until the end of the current billing period, and unused usage credits are refunded to your payment method within 5–7 business days.\n\nIf something isn't working, tell us first — most issues are fixed within the hour.",
    relatedRoute: { path: "/wallet", label: "Wallet" },
  },
  {
    id: "privacy",
    question: "How is my data and my leads' data protected?",
    keywords: ["data", "privacy", "private", "secure", "security", "encrypted", "encryption", "gdpr", "ccpa", "delete", "retention", "protect", "protected"],
    answer:
      "Lead data is encrypted in transit and at rest, isolated per account, and never used to train shared models.\n\n- Transcripts and recordings are retained for 12 months unless you delete them sooner\n- You can export or permanently delete a lead from Activity\n- We honour CCPA and GDPR deletion requests within 30 days",
  },
  {
    id: "human",
    question: "How do I reach a human?",
    keywords: ["human", "person", "people", "someone", "agent", "support", "help", "talk", "speak", "contact", "email", "ticket", "phone", "reach", "chat"],
    answer:
      "Happily. Email **support@energyengine.ai** or open a ticket on this page — a real person replies, usually within the hour (median 38 minutes). Include the lead ID if it's about a specific conversation and we'll pull the transcript before we answer.",
  },
];

export const KB_BY_ID: Record<string, KbEntry> = Object.fromEntries(KB.map((e) => [e.id, e]));

const STOP = new Set([
  "a", "an", "the", "is", "are", "am", "do", "does", "did", "i", "my", "me", "we", "our", "you", "your", "it", "its", "of", "to", "in", "on", "for",
  "and", "or", "with", "what", "how", "why", "can", "could", "would", "should", "will", "there", "this", "that", "be", "get", "have", "has", "please",
  "about", "any", "if", "at", "by", "so", "as", "from", "into", "want", "need", "know", "tell", "explain", "work", "works", "working",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

function stem(t: string): string {
  if (t.endsWith("ies") && t.length > 4) return t.slice(0, -3) + "y";
  if (t.endsWith("ing") && t.length > 5) return t.slice(0, -3);
  if (t.endsWith("ed") && t.length > 4) return t.slice(0, -2);
  if (t.endsWith("es") && t.length > 4) return t.slice(0, -2);
  if (t.endsWith("s") && t.length > 3 && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

export interface KbMatch {
  entry: KbEntry;
  score: number;
}

/** Scores each entry by keyword overlap with the query; returns the best match or null when nothing overlaps. */
export function matchKb(query: string): KbMatch | null {
  const tokens = tokenize(query);
  if (!tokens.length) return null;
  const unique = Array.from(new Set(tokens));
  let best: KbMatch | null = null;
  for (const entry of KB) {
    const keys = new Set(entry.keywords.map(stem));
    const questionTokens = new Set(tokenize(entry.question));
    let score = 0;
    for (const t of unique) {
      if (keys.has(t)) score += 2;
      if (questionTokens.has(t)) score += 1;
    }
    // Reward specific, rare keywords (e.g. "usdc", "tcpa") over generic ones.
    for (const t of unique) if (keys.has(t) && t.length >= 5) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best;
}
