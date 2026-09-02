import type { AgentVoice, WorkflowDefinition, WorkflowKind } from "@/types";

export const WORKFLOWS: WorkflowDefinition[] = [
  {
    kind: "generate_leads",
    label: "Generate Leads",
    shortLabel: "Leads",
    description: "Find and qualify homeowners in your active markets, then hand warm leads to your appointment setter.",
    examplePrompt: "Generate 25 new residential solar leads in my active markets this week.",
    leadPrompt: "Re-qualify {name} and find 3 look-alike homeowners on the same street.",
    icon: "users",
  },
  {
    kind: "set_appointments",
    label: "Set Appointments",
    shortLabel: "Appointments",
    description: "Call, text and email leads inside contact hours until a consultation is booked on your calendar.",
    examplePrompt: "Book consultations with every lead that hasn't been reached in the last 7 days.",
    leadPrompt: "Set an in-home consultation with {name} this week.",
    icon: "calendar",
  },
  {
    kind: "recover_cancels",
    label: "Recover Cancels",
    shortLabel: "Cancels",
    description: "Re-engage customers who cancelled or went cold and win the project back with the right offer.",
    examplePrompt: "Reach out to everyone who cancelled in the last 30 days and recover the project.",
    leadPrompt: "{name} cancelled. Recover the deal with our current promotion.",
    icon: "refresh",
  },
  {
    kind: "generate_referrals",
    label: "Generate Referrals",
    shortLabel: "Referrals",
    description: "Ask happy customers for referrals and pay out your referral budget automatically.",
    examplePrompt: "Ask every customer installed this year for a referral using our referral bonus.",
    leadPrompt: "Ask {name} for a referral and offer our referral bonus.",
    icon: "gift",
  },
  {
    kind: "recruit_talent",
    label: "Recruit Talent",
    shortLabel: "Talent",
    description: "Source, screen and schedule interviews with sales reps and installers in your markets.",
    examplePrompt: "Recruit 3 experienced solar closers in Illinois and schedule interviews.",
    leadPrompt: "Screen {name} for a sales role and schedule an interview.",
    icon: "briefcase",
  },
];

export const WORKFLOW_BY_KIND: Record<WorkflowKind, WorkflowDefinition> = Object.fromEntries(
  WORKFLOWS.map((w) => [w.kind, w]),
) as Record<WorkflowKind, WorkflowDefinition>;

export const AGENT_VOICES: AgentVoice[] = [
  { id: "jarvis", name: "Jarvis", trait: "Persistent", description: "Calm, methodical and relentless. Follows up until the appointment is booked." },
  { id: "jeremiah", name: "Jeremiah", trait: "Energetic", description: "Upbeat and fast. Great for high-volume outbound and referral asks." },
  { id: "jessica", name: "Jessica", trait: "Empathetic", description: "Warm and patient. Ideal for cancel recovery and nervous first-time buyers." },
  { id: "janice", name: "Janice", trait: "Curious", description: "Asks great discovery questions and uncovers the real objection." },
  { id: "custom", name: "Custom", trait: "Your voice", description: "Name your agent and describe the voice and tone you want." },
];
