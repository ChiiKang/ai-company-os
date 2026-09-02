import type {
  ActivityEvent,
  AgentProfile,
  BusinessProfile,
  Lead,
  LeadWorkflow,
  NotificationSettings,
  PortalSettings,
  StatRange,
  StatSeries,
  UserAccount,
  WalletState,
  WorkflowKind,
} from "@/types";
import { guessTimezone } from "./regions";

/* Deterministic PRNG so the demo data is stable across reloads. */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260901);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

export const NOW = new Date("2026-09-01T19:21:00-05:00");
const daysAgo = (d: number, h = 0) => new Date(NOW.getTime() - d * 86400000 - h * 3600000).toISOString();

export const USER: UserAccount = {
  id: "usr_hh",
  name: "Hassan Hewaidi",
  email: "hhewaidi@gmail.com",
  initials: "hh",
  plan: "pro",
};

const WORKFLOW_LABEL: Record<WorkflowKind, string> = {
  generate_leads: "Lead Generator",
  set_appointments: "Appointment Setter",
  recover_cancels: "Cancel Recovery",
  generate_referrals: "Referral Engine",
  recruit_talent: "Talent Recruiter",
};

function mkWorkflow(kind: WorkflowKind, startedAt: string, partial: Partial<LeadWorkflow> = {}): LeadWorkflow {
  return {
    id: `wf_${kind}_${startedAt.slice(0, 10)}`,
    kind,
    label: WORKFLOW_LABEL[kind],
    status: "active",
    startedAt,
    contactHours: "8:00 AM – 8:00 PM · Including weekends",
    summary: "",
    calls: [],
    sms: [],
    emails: [],
    ...partial,
  };
}

/* ---- Hand-written leads with rich transcripts ---------------------- */

const carlCox: Lead = {
  id: "PA-310826",
  firstName: "Carl",
  lastName: "Cox",
  phone: "+12675550142",
  email: "carl.cox@example.com",
  address: "1418 Chestnut Hill Rd",
  city: "West Chester",
  state: "PA",
  zip: "19380",
  notes: "Notice to Proceed. System size: 9.45 kW. Wants battery add-on quote.",
  status: "appointment_set",
  source: "Website form",
  systemSizeKw: 9.45,
  createdAt: daysAgo(14),
  lastReachedAt: daysAgo(1, 3),
  workflows: [
    mkWorkflow("set_appointments", daysAgo(13), {
      summary:
        "Carl was reached on the second call attempt. He is interested in a 9.45 kW system with a battery add-on and prefers an in-person consultation on a weekday evening. Appointment confirmed for Sep 4 at 6:30 PM.",
      calls: [
        {
          id: "call_1",
          at: daysAgo(12, 2),
          durationSec: 0,
          outcome: "No answer",
          transcript: [],
        },
        {
          id: "call_2",
          at: daysAgo(1, 3),
          durationSec: 254,
          outcome: "Appointment set",
          transcript: [
            { speaker: "agent", text: "Hi Carl, this is Jarvis with Sunbeam Solar. You requested a quote on our website for your home on Chestnut Hill Road. Is now a good time?" },
            { speaker: "lead", text: "Yeah, I have a few minutes. I was mostly curious about adding a battery." },
            { speaker: "agent", text: "Great. Based on your usage, a 9.45 kilowatt system with a single battery would cover about 96% of your annual consumption. Our crews are NABCEP certified and every install carries a 25-year workmanship warranty." },
            { speaker: "lead", text: "What's the price difference with the battery?" },
            { speaker: "agent", text: "The battery adds roughly $11,000 before the 30% federal credit. I can have a consultant walk through the exact numbers in person. Would a weekday evening work?" },
            { speaker: "lead", text: "Thursday evening is fine." },
            { speaker: "agent", text: "Perfect. I've booked Thursday, September 4 at 6:30 PM at your home. You'll get a text confirmation in a moment. Anything else I can help with?" },
            { speaker: "lead", text: "No, that's it. Thanks." },
          ],
        },
      ],
      sms: [
        { id: "sms_1", at: daysAgo(1, 2.9), direction: "outbound", text: "Hi Carl, confirming your in-home solar consultation on Thu Sep 4 at 6:30 PM with Sunbeam Solar. Reply C to confirm or R to reschedule." },
        { id: "sms_2", at: daysAgo(1, 2.5), direction: "inbound", text: "C" },
        { id: "sms_3", at: daysAgo(1, 2.4), direction: "outbound", text: "Confirmed. A calendar invite is on its way to carl.cox@example.com. See you Thursday!" },
      ],
      emails: [
        { id: "em_1", at: daysAgo(1, 2.3), direction: "outbound", subject: "Your Sunbeam Solar consultation — Thu Sep 4, 6:30 PM", body: "Hi Carl,\n\nThanks for speaking with us today. Your consultation is booked for Thursday, September 4 at 6:30 PM at 1418 Chestnut Hill Rd.\n\nWe'll bring a production estimate for a 9.45 kW system with a battery add-on, plus current federal and state incentives.\n\nSee you Thursday,\nSunbeam Solar" },
      ],
    }),
  ],
};

const trevorSchoeny: Lead = {
  id: "IL-292611",
  firstName: "Trevor",
  lastName: "Schoeny",
  phone: "+18152128738",
  email: "trevschoeny@gmail.com",
  address: "903 S W Brittany Dr",
  city: "Arlington Heights",
  state: "IL",
  zip: "60004",
  notes: "Notice to Proceed. System size: 9.45 kW",
  status: "opted_out",
  source: "Referral",
  systemSizeKw: 9.45,
  createdAt: daysAgo(40),
  lastReachedAt: daysAgo(38),
  workflows: [
    mkWorkflow("set_appointments", "2026-07-23T18:14:46.000Z", { status: "opted_out" }),
  ],
};

const susanBrown: Lead = {
  id: "IL-318842",
  firstName: "Susan",
  lastName: "Brown",
  phone: "+17085550188",
  email: "susan.brown@example.com",
  address: "2210 Maple Ave",
  city: "Evanston",
  state: "IL",
  zip: "60201",
  notes: "Roof replaced 2024. Interested in EV charger.",
  status: "appointment_set",
  source: "Lead Generator",
  createdAt: daysAgo(6),
  lastReachedAt: daysAgo(0, 3),
  workflows: [
    mkWorkflow("generate_leads", daysAgo(6), { status: "completed", summary: "Qualified via ComEd territory scan. Roof condition good, south-facing, ~$210/mo bill." }),
    mkWorkflow("set_appointments", daysAgo(5), {
      summary: "Susan contacted twice. Appointment set for Sep 6 at 10:00 AM (video call).",
      calls: [
        { id: "c1", at: daysAgo(3, 5), durationSec: 96, outcome: "Callback requested", transcript: [
          { speaker: "agent", text: "Hi Susan, Jessica with Sunbeam Solar. You were matched for a solar savings estimate. Do you have two minutes?" },
          { speaker: "lead", text: "I'm in a meeting, can you call back tomorrow afternoon?" },
          { speaker: "agent", text: "Absolutely. I'll reach out tomorrow after 2 PM. Have a great day." },
        ] },
        { id: "c2", at: daysAgo(0, 3), durationSec: 312, outcome: "Appointment set", transcript: [
          { speaker: "agent", text: "Hi Susan, Jessica again from Sunbeam Solar. Is now better?" },
          { speaker: "lead", text: "Yes, this works. We just got an EV so I'm curious about solar plus a charger." },
          { speaker: "agent", text: "That's a great combination. With your usage, a 7.2 kilowatt system would offset most of the bill and the charger qualifies for the same federal credit. Would a video walkthrough this weekend work?" },
          { speaker: "lead", text: "Saturday morning, sure." },
          { speaker: "agent", text: "Booked for Saturday, September 6 at 10 AM over Google Meet. Sending the link now." },
        ] },
      ],
      sms: [
        { id: "s1", at: daysAgo(0, 2.9), direction: "outbound", text: "Hi Susan, your video consultation with Sunbeam Solar is Sat Sep 6 at 10:00 AM. Meet link: meet.google.com/xyz-demo. Reply C to confirm." },
        { id: "s2", at: daysAgo(0, 2.7), direction: "inbound", text: "C thanks" },
      ],
      emails: [],
    }),
  ],
};

const davidChen: Lead = {
  id: "IL-301177",
  firstName: "David",
  lastName: "Chen",
  phone: "+16305550171",
  email: "david.chen@example.com",
  address: "88 Prairie Path Ln",
  city: "Naperville",
  state: "IL",
  zip: "60540",
  notes: "Cancelled Aug 12 citing price. Recovered with $1,500 promo + 0% APR.",
  status: "cancel_recovered",
  source: "Website form",
  systemSizeKw: 11.2,
  createdAt: daysAgo(45),
  lastReachedAt: daysAgo(0, 5),
  workflows: [
    mkWorkflow("recover_cancels", daysAgo(3), {
      status: "completed",
      summary: "David cancelled over financing. Jessica presented the Fall promotion ($1,500 off) and the 0% APR loan option. He re-signed and the install date was rebooked for Sep 18.",
      calls: [
        { id: "c1", at: daysAgo(0, 5), durationSec: 421, outcome: "Cancellation recovered", transcript: [
          { speaker: "agent", text: "Hi David, this is Jessica with Sunbeam Solar. I saw the project was cancelled and wanted to understand what changed." },
          { speaker: "lead", text: "Honestly the monthly payment was higher than we expected." },
          { speaker: "agent", text: "That makes sense. Two things changed since you signed: we have a $1,500 Fall promotion and a 0% APR option for 18 months. That brings the payment under your current electric bill." },
          { speaker: "lead", text: "Under the bill? Okay, that changes things." },
          { speaker: "agent", text: "I'll send the updated agreement now. If it looks right, we can keep your September install slot." },
          { speaker: "lead", text: "Send it over. Let's do it." },
        ] },
      ],
      sms: [{ id: "s1", at: daysAgo(0, 4.8), direction: "outbound", text: "David, your updated agreement with the $1,500 Fall promo and 0% APR is in your inbox. Install slot held for Sep 18." }],
      emails: [{ id: "e1", at: daysAgo(0, 4.8), direction: "outbound", subject: "Updated agreement — Sunbeam Solar", body: "Hi David,\n\nAttached is your updated agreement reflecting the $1,500 Fall promotion and 0% APR for 18 months. Your install slot on September 18 is reserved.\n\nThank you,\nSunbeam Solar" }],
    }),
  ],
};

const alexJones: Lead = {
  id: "IL-322009",
  firstName: "Alex",
  lastName: "Jones",
  phone: "+13125550123",
  email: "alex.jones@example.com",
  address: "410 W Belmont Ave",
  city: "Chicago",
  state: "IL",
  zip: "60657",
  notes: "Talent inquiry: 4 yrs solar sales (Sunrun). Available immediately.",
  status: "contacted",
  source: "Talent Recruiter",
  createdAt: daysAgo(2),
  lastReachedAt: daysAgo(1),
  workflows: [
    mkWorkflow("recruit_talent", daysAgo(2), {
      summary: "Alex responded to the closer role posting. Screening call complete; interview to be scheduled with Hassan.",
      calls: [{ id: "c1", at: daysAgo(1), durationSec: 540, outcome: "Screen passed", transcript: [
        { speaker: "agent", text: "Hi Alex, Jeremiah with Sunbeam Solar. Thanks for applying to the senior closer role. Can you tell me about your last solar sales position?" },
        { speaker: "lead", text: "Four years at Sunrun, mostly in-home. Averaged about 12 closes a month." },
        { speaker: "agent", text: "Strong numbers. Are you comfortable with a commission-heavy plan and evenings?" },
        { speaker: "lead", text: "That's what I'm used to." },
        { speaker: "agent", text: "Great. I'll get you on Hassan's calendar this week for a final interview." },
      ] }],
      sms: [], emails: [],
    }),
  ],
};

/* ---- Generated leads ------------------------------------------------ */

const FIRST = ["Abrar", "Cody", "Richard", "Brijesh", "Nikit", "Alok", "Farhan", "Srujal", "Maria", "James", "Priya", "Daniel", "Aisha", "Marcus", "Elena", "Tom", "Grace", "Omar", "Hannah", "Luis", "Kevin", "Nina", "Ravi", "Sophia", "Ethan", "Chloe", "Jamal", "Laura", "Victor", "Mei", "Andre", "Isabel", "Sean", "Fatima", "Noah"];
const LAST = ["B", "Mckee", "Pryce", "Desai", "Karadi", "Gupta", "Ahmed", "Patel", "Lopez", "Wilson", "Nair", "Kim", "Okafor", "Reed", "Petrov", "Nguyen", "Hughes", "Haddad", "Fischer", "Ortega", "Walsh", "Rao", "Martin", "Silva", "Brooks", "Lee", "Carter", "Young", "Diaz", "Chen", "Moore", "Khan", "Bennett", "Ali", "Foster"];
const CITIES: Record<string, string[]> = {
  IL: ["Chicago", "Naperville", "Aurora", "Joliet", "Schaumburg", "Evanston", "Peoria", "Rockford"],
  PA: ["Philadelphia", "Pittsburgh", "Allentown", "Reading", "Lancaster", "West Chester"],
  TX: ["Austin", "Houston", "Dallas", "San Antonio"],
  CA: ["San Jose", "Fresno", "Sacramento", "Riverside"],
  AZ: ["Phoenix", "Mesa", "Tucson"],
  FL: ["Tampa", "Orlando", "Jacksonville"],
  NJ: ["Newark", "Edison", "Cherry Hill"],
};
const STATES = ["IL", "IL", "IL", "IL", "IL", "PA", "PA", "TX", "CA", "AZ", "FL", "NJ"];
const STREETS = ["Oak St", "Maple Ave", "Prairie Path Ln", "Lakeview Dr", "Elm St", "Washington Blvd", "Sunset Rd", "Highland Ave", "Cedar Ct", "Willow Way"];
const SOURCES = ["Website form", "Lead Generator", "Referral", "Facebook ad", "Door knock", "Google ad"];
const STATUSES: Lead["status"][] = ["new", "new", "contacted", "contacted", "contacted", "appointment_set", "appointment_set", "opted_out", "closed_won", "closed_lost", "cancel_recovered", "referral"];

function genLead(i: number): Lead {
  const firstName = FIRST[i % FIRST.length];
  const lastName = LAST[(i * 7) % LAST.length];
  const state = pick(STATES);
  const city = pick(CITIES[state]);
  const status = pick(STATUSES);
  const created = between(3, 120);
  const reached = Math.max(0, created - between(1, Math.min(created, 60)));
  const kind: WorkflowKind = status === "cancel_recovered" ? "recover_cancels" : status === "referral" ? "generate_referrals" : "set_appointments";
  const wf = mkWorkflow(kind, daysAgo(created - 1), {
    status: status === "opted_out" ? "opted_out" : status === "closed_won" || status === "closed_lost" ? "completed" : "active",
    summary:
      status === "new"
        ? ""
        : status === "appointment_set"
          ? `${firstName} agreed to a consultation after ${between(1, 3)} contact attempts. Preferred a ${pick(["weekday evening", "Saturday morning", "video call"])}.`
          : status === "opted_out"
            ? `${firstName} asked not to be contacted again. Number suppressed.`
            : `${firstName} was contacted ${between(1, 4)} times. Last touch was a ${pick(["voicemail", "text reply", "short call"])}.`,
    calls:
      status === "new"
        ? []
        : [
            {
              id: `c_${i}`,
              at: daysAgo(reached, 2),
              durationSec: status === "appointment_set" ? between(120, 400) : between(0, 90),
              outcome: status === "appointment_set" ? "Appointment set" : pick(["Voicemail", "No answer", "Callback requested", "Not interested"]),
              transcript:
                status === "appointment_set"
                  ? [
                      { speaker: "agent", text: `Hi ${firstName}, this is Jarvis with Sunbeam Solar following up on your solar estimate request.` },
                      { speaker: "lead", text: "Sure, what do you need from me?" },
                      { speaker: "agent", text: "Just a quick 30-minute walkthrough of your savings. Would a weekday evening work?" },
                      { speaker: "lead", text: "Thursday works." },
                      { speaker: "agent", text: "Booked. You'll get a confirmation text shortly." },
                    ]
                  : [],
            },
          ],
    sms:
      status === "new"
        ? []
        : [{ id: `s_${i}`, at: daysAgo(reached, 1), direction: "outbound", text: `Hi ${firstName}, it's Sunbeam Solar. We tried to reach you about your solar savings estimate. Reply YES for a callback or STOP to opt out.` }],
    emails: [],
  });
  return {
    id: `${state}-${300000 + i * 97}`,
    firstName,
    lastName,
    phone: `+1${between(201, 989)}555${(1000 + i).toString().padStart(4, "0")}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s/g, "")}@example.com`,
    address: `${between(10, 9800)} ${pick(STREETS)}`,
    city,
    state,
    zip: `${between(10000, 99999)}`,
    notes: pick(["", "", "Interested in battery storage.", "Renter — needs landlord approval.", "High bill: $280/mo.", "Prefers text over calls.", "Shading on east roof."]),
    status,
    source: pick(SOURCES),
    systemSizeKw: rand() > 0.5 ? Math.round(between(50, 140) / 10) : undefined,
    createdAt: daysAgo(created),
    lastReachedAt: daysAgo(reached, between(0, 20)),
    workflows: [wf],
  };
}

const generated: Lead[] = Array.from({ length: 78 }, (_, i) => genLead(i));
// Force the first few generated leads to match the reference table.
const forced: Array<[string, string, string, number]> = [
  ["Abrar", "B", "IL", 2], ["Cody", "Mckee", "IL", 3], ["Richard", "Pryce", "IL", 4], ["Brijesh", "Desai", "IL", 5],
  ["Nikit", "Karadi", "IL", 6], ["Alok", "Gupta", "IL", 7], ["Farhan", "Ahmed", "IL", 8], ["Srujal", "Patel", "IL", 9],
];
forced.forEach(([f, l, st, d], i) => {
  generated[i] = { ...generated[i], firstName: f, lastName: l, state: st, city: pick(CITIES[st]), lastReachedAt: daysAgo(d, 4), id: `${st}-${310000 + i * 13}` };
});

export const LEADS: Lead[] = [carlCox, susanBrown, davidChen, alexJones, ...generated, trevorSchoeny].sort(
  (a, b) => new Date(b.lastReachedAt).getTime() - new Date(a.lastReachedAt).getTime(),
);

/** The reference design shows 383 leads; the demo ships a smaller sample and reports the real count. */
export const TOTAL_LEADS_HINT = 383;

/* ---- Activity feed --------------------------------------------------- */

export const ACTIVITY: ActivityEvent[] = [
  { id: "a1", at: daysAgo(0, 3), kind: "appointment_set", title: "Appointment set with Susan Brown", leadId: susanBrown.id, lines: ["Susan Brown contacted twice — video consultation booked Sat Sep 6, 10:00 AM", "Confirmation text delivered and acknowledged"] },
  { id: "a2", at: daysAgo(0, 5), kind: "cancel_recovered", title: "Cancellation recovered for David Chen", leadId: davidChen.id, lines: ["Presented Fall promotion + 0% APR", "Updated agreement sent, Sep 18 install slot held"] },
  { id: "a3", at: daysAgo(1), kind: "talent_inquiry", title: "Talent inquiry from Alex Jones", leadId: alexJones.id, lines: ["Alex Jones from the closer posting contacted and screened", "Final interview to be scheduled with Hassan"] },
  { id: "a4", at: daysAgo(1, 3), kind: "appointment_set", title: "Appointment set with Carl Cox", leadId: carlCox.id, lines: ["In-home consultation Thu Sep 4, 6:30 PM", "9.45 kW + battery add-on requested"] },
  { id: "a5", at: daysAgo(1, 9), kind: "lead_generated", title: "12 new leads qualified in ComEd territory", lines: ["Lead Generator scanned Evanston, Skokie, Wilmette", "Average bill $195/mo, all owner-occupied"] },
  { id: "a6", at: daysAgo(2, 2), kind: "referral_generated", title: "Referral received from Maria Lopez", leadId: generated[8]?.id, lines: ["Referred neighbor at 2214 Maple Ave", "$250 referral bonus queued"] },
  { id: "a7", at: daysAgo(2, 6), kind: "sms", title: "Text conversation with Cody Mckee", leadId: generated[1]?.id, lines: ["Cody asked about roof age requirements", "Agent answered and offered a Saturday slot"] },
  { id: "a8", at: daysAgo(3, 1), kind: "opted_out", title: "Richard Pryce opted out", leadId: generated[2]?.id, lines: ["Number suppressed across all workflows"] },
  { id: "a9", at: daysAgo(3, 7), kind: "call", title: "Voicemail left for Brijesh Desai", leadId: generated[3]?.id, lines: ["Second attempt scheduled for tomorrow 10:00 AM"] },
  { id: "a10", at: daysAgo(4, 2), kind: "email", title: "Proposal emailed to Nikit Karadi", leadId: generated[4]?.id, lines: ["8.4 kW proposal with $1,500 Fall promotion"] },
];

/* ---- Performance stats ---------------------------------------------- */

const spark = (base: number, n = 14, drift = 0.08) =>
  Array.from({ length: n }, (_, i) => Math.round(base * (0.7 + (i / n) * 0.5 + (rand() - 0.5) * drift * 4)));

export const STATS: Record<StatRange, StatSeries[]> = {
  all: [
    { key: "leads", label: "Leads Generated", value: 1248, deltaPct: 12, series: spark(90) },
    { key: "appointments", label: "Appointments Set", value: 315, deltaPct: 16, series: spark(22) },
    { key: "cancels", label: "Cancels Recovered", value: 87, deltaPct: 5, series: spark(6) },
    { key: "referrals", label: "Referrals Generated", value: 42, deltaPct: -10, series: spark(4) },
  ],
  today: [
    { key: "leads", label: "Leads Generated", value: 12, deltaPct: 20, series: spark(1.5, 12, 0.5) },
    { key: "appointments", label: "Appointments Set", value: 3, deltaPct: 50, series: spark(0.4, 12, 0.6) },
    { key: "cancels", label: "Cancels Recovered", value: 1, deltaPct: 0, series: spark(0.2, 12, 0.6) },
    { key: "referrals", label: "Referrals Generated", value: 0, deltaPct: -100, series: spark(0.1, 12, 0.5) },
  ],
  custom: [
    { key: "leads", label: "Leads Generated", value: 402, deltaPct: 9, series: spark(30) },
    { key: "appointments", label: "Appointments Set", value: 96, deltaPct: 11, series: spark(7) },
    { key: "cancels", label: "Cancels Recovered", value: 24, deltaPct: 4, series: spark(2) },
    { key: "referrals", label: "Referrals Generated", value: 15, deltaPct: -6, series: spark(1.2) },
  ],
};

/* ---- Wallet ---------------------------------------------------------- */

export const WALLET: WalletState = {
  plan: "pro",
  renewsAt: "2026-09-30T00:00:00.000Z",
  paymentMethod: { brand: "visa", last4: "6248" },
  creditsUsd: 139.22,
  usdcBalance: 0,
  advancedMode: false,
  autoReload: { enabled: false, thresholdUsd: 25, amountUsd: 100 },
  transactions: [
    { id: "t1", at: daysAgo(0, 6), kind: "usage", description: "Cancel Recovery · David Chen (1 call, 1 SMS, 1 email)", amount: -1.84, currency: "USD" },
    { id: "t2", at: daysAgo(0, 4), kind: "usage", description: "Appointment Setter · Susan Brown (2 calls, 2 SMS)", amount: -2.35, currency: "USD" },
    { id: "t3", at: daysAgo(1, 10), kind: "usage", description: "Lead Generator · ComEd territory scan (12 leads)", amount: -9.6, currency: "USD" },
    { id: "t4", at: daysAgo(2), kind: "subscription", description: "Pro plan · monthly", amount: -249, currency: "USD" },
    { id: "t5", at: daysAgo(9), kind: "purchase", description: "Usage credits", amount: 150, currency: "USD" },
  ],
};

/* ---- Settings --------------------------------------------------------- */

export const BUSINESS_DEFAULT: BusinessProfile = {
  fullName: "Hassan Hewaidi",
  preferredName: "",
  email: "hhewaidi@gmail.com",
  phone: "",
  companyName: "Sunbeam Solar Co.",
  companyWebsite: "sunbeamsolar.example.com",
  companyBio: "Family-run solar installer serving the South Bay since 2016. NABCEP-certified crews, 25-year workmanship warranty.",
  products: ["residential_pv", "battery_storage"],
  financing: ["cash", "loan", "lease"],
  warranties: ["workmanship_25", "panel_25"],
  referralBudgetMin: 250,
  referralBudgetMax: 750,
  rebateBudgetMin: null,
  rebateBudgetMax: null,
  promotions: [],
  activeMarkets: [],
  targetMarkets: "South Bay · ComEd territory",
};

const HOURS = { enabled: true, open: "08:00", close: "20:00" };
export const NOTIFICATIONS_DEFAULT: NotificationSettings = {
  appointmentTypes: ["in_person", "video_call", "voice_call", "customer_preference"],
  businessHours: { mon: { ...HOURS }, tue: { ...HOURS }, wed: { ...HOURS }, thu: { ...HOURS }, fri: { ...HOURS }, sat: { ...HOURS }, sun: { ...HOURS } },
  timezone: guessTimezone(),
  calendar: { provider: "google_calendar", connected: true, account: "hhewaidi@gmail.com" },
  video: { provider: "google_meet", connected: true, account: "hhewaidi@gmail.com" },
  channels: ["email", "sms"],
};

export const AGENT_DEFAULT: AgentProfile = {
  testPhone: "",
  companyName: "Sunbeam Solar Co.",
  languages: [],
  voice: null,
  customName: "",
  customVoiceDescription: "",
  training: [],
  trainingNotes: "",
};

export const SETTINGS_DEFAULT: PortalSettings = {
  business: BUSINESS_DEFAULT,
  notifications: NOTIFICATIONS_DEFAULT,
  agent: AGENT_DEFAULT,
};
