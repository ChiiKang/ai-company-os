/**
 * FROZEN INTERFACE CONTRACT (Wave 0).
 * Every page lane codes against these types. Do not change shapes without
 * updating every consumer; add optional fields only.
 */

export type ISODate = string;

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  initials: string;
  plan: PlanTier;
}

export type PlanTier = "starter" | "pro" | "enterprise";

/* ------------------------------------------------------------------ */
/* Workflows                                                           */
/* ------------------------------------------------------------------ */

export type WorkflowKind =
  | "generate_leads"
  | "set_appointments"
  | "recover_cancels"
  | "generate_referrals"
  | "recruit_talent";

export interface WorkflowDefinition {
  kind: WorkflowKind;
  label: string;
  shortLabel: string;
  description: string;
  /** Example prompt inserted into the composer when selected with no lead. */
  examplePrompt: string;
  /** Example prompt when a lead is in context. `{name}` is replaced. */
  leadPrompt: string;
  icon: IconName;
}

export type LeadWorkflowStatus = "active" | "paused" | "completed" | "opted_out";

/* ------------------------------------------------------------------ */
/* Leads & activity                                                    */
/* ------------------------------------------------------------------ */

export type LeadStatus =
  | "new"
  | "contacted"
  | "appointment_set"
  | "cancel_recovered"
  | "referral"
  | "opted_out"
  | "closed_won"
  | "closed_lost";

export interface Lead {
  id: string; // e.g. "PA-310826"
  firstName: string;
  lastName: string;
  phone: string; // E.164
  email: string;
  address: string; // street
  city: string;
  state: string; // 2-letter region code
  zip: string;
  notes: string;
  status: LeadStatus;
  source: string;
  systemSizeKw?: number;
  createdAt: ISODate;
  lastReachedAt: ISODate;
  workflows: LeadWorkflow[];
}

export interface LeadWorkflow {
  id: string;
  kind: WorkflowKind;
  label: string; // e.g. "Appointment Setter"
  status: LeadWorkflowStatus;
  startedAt: ISODate;
  contactHours: string; // e.g. "8:00 AM – 8:00 PM · Including weekends"
  summary: string; // empty string when nothing recorded yet
  calls: CallRecord[];
  sms: MessageRecord[];
  emails: EmailRecord[];
}

export interface TranscriptLine {
  speaker: "agent" | "lead";
  text: string;
  at?: ISODate;
}

export interface CallRecord {
  id: string;
  at: ISODate;
  durationSec: number;
  outcome: string; // "Appointment set", "Voicemail", "No answer", ...
  transcript: TranscriptLine[];
}

export interface MessageRecord {
  id: string;
  at: ISODate;
  direction: "inbound" | "outbound";
  text: string;
}

export interface EmailRecord {
  id: string;
  at: ISODate;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
}

export type ActivityKind =
  | "lead_generated"
  | "appointment_set"
  | "cancel_recovered"
  | "referral_generated"
  | "talent_inquiry"
  | "call"
  | "sms"
  | "email"
  | "opted_out"
  | "workflow_started";

export interface ActivityEvent {
  id: string;
  at: ISODate;
  kind: ActivityKind;
  title: string; // "Appointment set with Susan Brown"
  leadId?: string;
  lines: string[]; // supporting detail lines
}

/* ------------------------------------------------------------------ */
/* Performance stats                                                   */
/* ------------------------------------------------------------------ */

export type StatKey = "leads" | "appointments" | "cancels" | "referrals";
export type StatRange = "today" | "all" | "custom";

export interface StatSeries {
  key: StatKey;
  label: string; // "Leads Generated"
  value: number;
  deltaPct: number; // +12 / -10
  series: number[]; // sparkline points (oldest → newest)
}

export interface CustomRange {
  from: ISODate;
  to: ISODate;
}

/* ------------------------------------------------------------------ */
/* Wallet                                                              */
/* ------------------------------------------------------------------ */

export type Currency = "USD" | "USDC";

export interface PaymentMethod {
  brand: "visa" | "mastercard" | "amex" | "usdc";
  last4: string; // for usdc: last 4 of wallet address
  label?: string;
}

export interface WalletTransaction {
  id: string;
  at: ISODate;
  kind: "purchase" | "usage" | "subscription" | "reload" | "refund";
  description: string;
  amount: number; // positive = credit added, negative = spent
  currency: Currency;
}

export interface WalletState {
  plan: PlanTier;
  renewsAt: ISODate;
  paymentMethod: PaymentMethod | null;
  creditsUsd: number; // prepaid usage credits
  usdcBalance: number; // on-chain USDC balance available for agentic commerce
  advancedMode: boolean; // pay for open agentic commerce tools with USDC
  autoReload: { enabled: boolean; thresholdUsd: number; amountUsd: number };
  transactions: WalletTransaction[];
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export type ProductOffering =
  | "residential_pv"
  | "commercial_pv"
  | "battery_storage"
  | "ev_charger"
  | "roofing"
  | "hvac"
  | "generator"
  | "energy_audit"
  | "monitoring"
  | "maintenance";

export type FinancingOption = "cash" | "loan" | "lease" | "ppa" | "pace";

export type WarrantyOption =
  | "workmanship_10"
  | "workmanship_25"
  | "panel_25"
  | "inverter_12"
  | "battery_10"
  | "production_guarantee";

export interface PromotionAttachment {
  id: string;
  name: string;
  sizeBytes: number;
  type: string;
}

export interface Promotion {
  id: string;
  text: string;
  expiresAt: ISODate | ""; // "" = no expiry
  attachments: PromotionAttachment[];
}

export interface BusinessProfile {
  fullName: string;
  preferredName: string;
  email: string;
  phone: string;
  companyName: string;
  companyWebsite: string; // recommended, may be ""
  companyBio: string;
  products: ProductOffering[];
  financing: FinancingOption[];
  warranties: WarrantyOption[];
  referralBudgetMin: number | null;
  referralBudgetMax: number | null;
  rebateBudgetMin: number | null;
  rebateBudgetMax: number | null;
  promotions: Promotion[];
  activeMarkets: string[]; // region codes from data/regions.ts
  targetMarkets: string; // free text: cities / zip codes / utility zones
}

export type AppointmentType = "in_person" | "video_call" | "voice_call" | "customer_preference";
export type NotificationChannel = "email" | "sms" | "push";
export type CalendarProvider = "calendly" | "microsoft_teams" | "google_calendar";
export type VideoProvider = "zoom" | "microsoft_teams" | "google_meet";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface DayHours {
  enabled: boolean;
  open: string; // "08:00"
  close: string; // "20:00"
}

export interface NotificationSettings {
  appointmentTypes: AppointmentType[];
  businessHours: Record<Weekday, DayHours>;
  timezone: string; // IANA
  calendar: { provider: CalendarProvider; connected: boolean; account?: string } | null;
  video: { provider: VideoProvider; connected: boolean; account?: string } | null;
  channels: NotificationChannel[];
}

export type AgentLanguage = "en" | "es";
export type AgentVoiceId = "jarvis" | "jeremiah" | "jessica" | "janice" | "custom";

export interface AgentVoice {
  id: AgentVoiceId;
  name: string;
  trait: string; // "persistent" | "energetic" | ...
  description: string;
}

export interface TrainingAsset {
  id: string;
  name: string;
  kind: "script" | "photo" | "video" | "document" | "other";
  sizeBytes: number;
  addedAt: ISODate;
}

export interface AgentProfile {
  testPhone: string;
  companyName: string;
  languages: AgentLanguage[];
  voice: AgentVoiceId | null;
  customName: string;
  customVoiceDescription: string;
  training: TrainingAsset[];
  trainingNotes: string;
}

export interface PortalSettings {
  business: BusinessProfile;
  notifications: NotificationSettings;
  agent: AgentProfile;
}

/* ------------------------------------------------------------------ */
/* Support                                                             */
/* ------------------------------------------------------------------ */

export interface SupportTicket {
  id: string;
  createdAt: ISODate;
  subject: string;
  category: "billing" | "agent" | "integration" | "bug" | "other";
  message: string;
  status: "open" | "in_progress" | "resolved";
}

/* ------------------------------------------------------------------ */
/* Chat / agent                                                        */
/* ------------------------------------------------------------------ */

export type ChatRole = "user" | "assistant";

export interface ChatCardLead {
  type: "lead";
  leadId: string;
}
export interface ChatCardStat {
  type: "stats";
  range: StatRange;
}
export interface ChatCardWorkflow {
  type: "workflow_started";
  workflow: WorkflowKind;
  leadId?: string;
  scheduledFor?: ISODate;
}
export interface ChatCardActions {
  type: "actions";
  actions: { label: string; prompt: string }[];
}
export type ChatCard = ChatCardLead | ChatCardStat | ChatCardWorkflow | ChatCardActions;

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string; // markdown-lite (paragraphs, **bold**, bullet lines)
  at: ISODate;
  status?: "streaming" | "done" | "error";
  cards?: ChatCard[];
}

export interface AgentContext {
  leadId?: string;
  workflow?: WorkflowKind;
}

export interface AgentReply {
  content: string;
  cards?: ChatCard[];
  /** Side effects the UI should apply (lane A applies them through the store). */
  effects?: AgentEffect[];
}

export type AgentEffect =
  | { type: "start_workflow"; workflow: WorkflowKind; leadId?: string }
  | { type: "log_activity"; event: Omit<ActivityEvent, "id" | "at"> };

export interface AgentAdapter {
  name: string;
  /** Streams text deltas through onDelta and resolves with the full reply. */
  send(
    input: { messages: ChatMessage[]; context: AgentContext; snapshot: AgentSnapshot },
    onDelta: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<AgentReply>;
}

/** Read-only projection of portal state handed to the agent brain. */
export interface AgentSnapshot {
  user: UserAccount;
  leads: Lead[];
  activity: ActivityEvent[];
  stats: StatSeries[];
  wallet: WalletState;
  settings: PortalSettings;
}

/* ------------------------------------------------------------------ */
/* Icons (names available in components/ui/Icon.tsx)                   */
/* ------------------------------------------------------------------ */

export type IconName =
  | "command"
  | "activity"
  | "wallet"
  | "settings"
  | "support"
  | "sun"
  | "moon"
  | "logout"
  | "search"
  | "refresh"
  | "chevron-down"
  | "chevron-right"
  | "chevron-up"
  | "chevron-left"
  | "arrow-left"
  | "arrow-right"
  | "arrow-up-right"
  | "send"
  | "paperclip"
  | "phone"
  | "mail"
  | "message"
  | "mic"
  | "sparkle"
  | "check"
  | "x"
  | "plus"
  | "edit"
  | "trash"
  | "external"
  | "globe"
  | "gift"
  | "megaphone"
  | "box"
  | "bell"
  | "user"
  | "users"
  | "calendar"
  | "video"
  | "upload"
  | "zap"
  | "shield"
  | "copy"
  | "clock"
  | "star"
  | "info"
  | "alert"
  | "card"
  | "coins"
  | "briefcase"
  | "bot"
  | "menu"
  | "more"
  | "filter"
  | "play"
  | "pause"
  | "download"
  | "file"
  | "image"
  | "link"
  | "map-pin"
  | "trending-up"
  | "trending-down"
  | "book"
  | "lifebuoy"
  | "loader";
