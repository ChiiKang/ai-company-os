import type { AgentProfile, BusinessProfile, NotificationSettings, PortalSettings } from "@/types";

/**
 * Settings completion model.
 * Business = 9 fields, Notifications = 5 groups, Agent = 4 steps.
 * Only `required` entries count toward the overall percent; recommended and
 * optional entries only show up in a section's completed/total tally.
 */

export type SettingsSection = "business" | "notifications" | "agent";

export interface MissingField {
  section: SettingsSection;
  field: string;
  /** Call to action, e.g. "Add your phone number". */
  label: string;
  /** Route incl. hash, e.g. "/settings/business#identity". */
  path: string;
}

export interface SectionProgress {
  completed: number;
  total: number;
  requiredDone: number;
  requiredTotal: number;
  requiredMissing: MissingField[];
  state: "complete" | "in_progress" | "not_started";
}

export interface SettingsProgress {
  percent: number;
  requiredDone: number;
  requiredTotal: number;
  requiredMissing: MissingField[];
  sections: Record<SettingsSection, SectionProgress>;
}

interface FieldDef<T> {
  key: string;
  label: string;
  hash: string;
  required: boolean;
  done: (v: T) => boolean;
}

const has = (s: string | null | undefined) => !!s && s.trim().length > 0;
const isNum = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

export const BUSINESS_FIELDS: FieldDef<BusinessProfile>[] = [
  { key: "fullName", label: "Add your full name", hash: "identity", required: true, done: (b) => has(b.fullName) },
  { key: "preferredName", label: "Add your preferred name", hash: "identity", required: true, done: (b) => has(b.preferredName) },
  { key: "email", label: "Add your email", hash: "identity", required: true, done: (b) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()) },
  { key: "phone", label: "Add your phone number", hash: "identity", required: true, done: (b) => b.phone.replace(/\D/g, "").length >= 10 },
  { key: "companyName", label: "Add your company name", hash: "identity", required: true, done: (b) => has(b.companyName) },
  { key: "products", label: "Choose your products", hash: "products", required: true, done: (b) => b.products.length > 0 },
  {
    key: "referrals",
    label: "Set your referral budget",
    hash: "referrals",
    required: true,
    done: (b) => isNum(b.referralBudgetMin) && isNum(b.referralBudgetMax) && b.referralBudgetMax >= b.referralBudgetMin,
  },
  { key: "promotions", label: "Add an active promotion", hash: "promotions", required: true, done: (b) => b.promotions.some((p) => has(p.text)) },
  { key: "markets", label: "Select active markets", hash: "markets", required: true, done: (b) => b.activeMarkets.length > 0 },
];

export const NOTIFICATION_FIELDS: FieldDef<NotificationSettings>[] = [
  { key: "appointmentTypes", label: "Pick appointment types", hash: "appointments", required: true, done: (n) => n.appointmentTypes.length > 0 },
  { key: "businessHours", label: "Set your business hours", hash: "hours", required: false, done: (n) => Object.values(n.businessHours).some((d) => d.enabled) },
  { key: "timezone", label: "Set your timezone", hash: "timezone", required: true, done: (n) => has(n.timezone) },
  { key: "integrations", label: "Connect a calendar", hash: "calendar", required: false, done: (n) => !!n.calendar?.connected || !!n.video?.connected },
  { key: "channels", label: "Choose how to be notified", hash: "channels", required: true, done: (n) => n.channels.length > 0 },
];

export const AGENT_FIELDS: FieldDef<AgentProfile>[] = [
  { key: "testPhone", label: "Test your agent", hash: "test", required: true, done: (a) => a.testPhone.replace(/\D/g, "").length >= 10 },
  { key: "companyName", label: "Name your company", hash: "company", required: false, done: (a) => has(a.companyName) },
  { key: "languages", label: "Pick agent languages", hash: "language", required: true, done: (a) => a.languages.length > 0 },
  { key: "voice", label: "Choose your agent's voice", hash: "voice", required: true, done: (a) => a.voice !== null && (a.voice !== "custom" || has(a.customName)) },
];

const ROUTES: Record<SettingsSection, string> = {
  business: "/settings/business",
  notifications: "/settings/notifications",
  agent: "/settings/agent",
};

function section<T>(name: SettingsSection, defs: FieldDef<T>[], value: T): SectionProgress {
  let completed = 0;
  let requiredDone = 0;
  let requiredTotal = 0;
  const requiredMissing: MissingField[] = [];
  for (const d of defs) {
    const ok = d.done(value);
    if (ok) completed += 1;
    if (d.required) {
      requiredTotal += 1;
      if (ok) requiredDone += 1;
      else requiredMissing.push({ section: name, field: d.key, label: d.label, path: `${ROUTES[name]}#${d.hash}` });
    }
  }
  const state: SectionProgress["state"] = requiredMissing.length === 0 ? "complete" : requiredDone === 0 ? "not_started" : "in_progress";
  return { completed, total: defs.length, requiredDone, requiredTotal, requiredMissing, state };
}

export function computeProgress(settings: PortalSettings): SettingsProgress {
  const sections = {
    business: section("business", BUSINESS_FIELDS, settings.business),
    notifications: section("notifications", NOTIFICATION_FIELDS, settings.notifications),
    agent: section("agent", AGENT_FIELDS, settings.agent),
  };
  const all = [sections.business, sections.notifications, sections.agent];
  const requiredDone = all.reduce((n, s) => n + s.requiredDone, 0);
  const requiredTotal = all.reduce((n, s) => n + s.requiredTotal, 0);
  const requiredMissing = all.flatMap((s) => s.requiredMissing);
  const percent = requiredTotal === 0 ? 100 : Math.round((requiredDone / requiredTotal) * 100);
  return { percent, requiredDone, requiredTotal, requiredMissing, sections };
}

export const isBusinessComplete = (b: BusinessProfile) => section("business", BUSINESS_FIELDS, b).state === "complete";
export const isNotificationsComplete = (n: NotificationSettings) => section("notifications", NOTIFICATION_FIELDS, n).state === "complete";
export const isAgentComplete = (a: AgentProfile) => section("agent", AGENT_FIELDS, a).state === "complete";

/** Whether one named field in a section is complete (used for REQUIRED / COMPLETE badges). */
export function isFieldDone(settings: PortalSettings, sectionName: SettingsSection, key: string): boolean {
  if (sectionName === "business") return BUSINESS_FIELDS.find((f) => f.key === key)?.done(settings.business) ?? false;
  if (sectionName === "notifications") return NOTIFICATION_FIELDS.find((f) => f.key === key)?.done(settings.notifications) ?? false;
  return AGENT_FIELDS.find((f) => f.key === key)?.done(settings.agent) ?? false;
}
