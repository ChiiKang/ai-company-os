import type { AgentLanguage, AppointmentType, CalendarProvider, FinancingOption, NotificationChannel, ProductOffering, VideoProvider, WarrantyOption, Weekday } from "@/types";

export const PRODUCT_LABELS: Record<ProductOffering, string> = {
  residential_pv: "Residential PV",
  commercial_pv: "Commercial PV",
  battery_storage: "Battery storage",
  ev_charger: "EV charger",
  roofing: "Roofing",
  hvac: "HVAC",
  generator: "Generator",
  energy_audit: "Energy audit",
  monitoring: "Monitoring",
  maintenance: "Maintenance",
};
export const PRODUCTS = Object.keys(PRODUCT_LABELS) as ProductOffering[];

export const FINANCING_LABELS: Record<FinancingOption, string> = {
  cash: "Cash",
  loan: "Loan",
  lease: "Lease",
  ppa: "PPA",
  pace: "PACE",
};
export const FINANCING = Object.keys(FINANCING_LABELS) as FinancingOption[];

export const WARRANTY_LABELS: Record<WarrantyOption, string> = {
  workmanship_10: "10-yr workmanship",
  workmanship_25: "25-yr workmanship",
  panel_25: "25-yr panel",
  inverter_12: "12-yr inverter",
  battery_10: "10-yr battery",
  production_guarantee: "Production guarantee",
};
export const WARRANTIES = Object.keys(WARRANTY_LABELS) as WarrantyOption[];

export const APPOINTMENT_LABELS: Record<AppointmentType, string> = {
  in_person: "In person",
  video_call: "Video call",
  voice_call: "Voice call",
  customer_preference: "All of the above — based on customer preference",
};
export const APPOINTMENT_TYPES = Object.keys(APPOINTMENT_LABELS) as AppointmentType[];

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: "Email",
  sms: "Text message",
  push: "Allow device notifications",
};

export const WEEKDAYS: { key: Weekday; label: string; short: string }[] = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
];

export const CALENDAR_PROVIDERS: { id: CalendarProvider; name: string; vendor: string }[] = [
  { id: "calendly", name: "Calendly", vendor: "Calendly" },
  { id: "microsoft_teams", name: "Microsoft Teams", vendor: "Microsoft" },
  { id: "google_calendar", name: "Google Calendar", vendor: "Google" },
];

export const VIDEO_PROVIDERS: { id: VideoProvider; name: string; vendor: string }[] = [
  { id: "zoom", name: "Zoom", vendor: "Zoom" },
  { id: "microsoft_teams", name: "Microsoft Teams", vendor: "Microsoft" },
  { id: "google_meet", name: "Google Meet", vendor: "Google" },
];

export const LANGUAGE_LABELS: Record<AgentLanguage, string> = { en: "English", es: "Spanish" };

/** Formats a US phone as the user types: (555) 123-4567. */
export function formatPhoneInput(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Splits free-text target markets into distinct zones. */
export function splitZones(text: string): string[] {
  return text
    .split(/[,\n;·•|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function timezoneOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    return name === "GMT" ? "GMT+0" : name;
  } catch {
    return "";
  }
}
