import { useNavigate } from "react-router-dom";
import type { ChatCard, LeadStatus, StatRange, WorkflowKind } from "@/types";
import { usePortal, usePortalActions } from "@/store/PortalProvider";
import { WORKFLOW_BY_KIND } from "@/data/workflows";
import { Badge, Button, Chip, Icon } from "@/components/ui";
import { formatDate, formatNumber, fullName } from "@/lib/format";

export const STATUS_TONE: Record<LeadStatus, "neutral" | "accent" | "success" | "warning" | "danger" | "info"> = {
  new: "info",
  contacted: "neutral",
  appointment_set: "success",
  cancel_recovered: "success",
  referral: "accent",
  opted_out: "danger",
  closed_won: "success",
  closed_lost: "warning",
};

export function statusLabel(s: LeadStatus): string {
  return s.replace(/_/g, " ");
}

export function ChatCards({ cards, onPrompt }: { cards: ChatCard[]; onPrompt: (prompt: string) => void }) {
  return (
    <div className="chat-cards">
      {cards.map((c, i) => (
        <CardView key={i} card={c} onPrompt={onPrompt} />
      ))}
    </div>
  );
}

function CardView({ card, onPrompt }: { card: ChatCard; onPrompt: (prompt: string) => void }) {
  switch (card.type) {
    case "lead":
      return <LeadCard leadId={card.leadId} />;
    case "stats":
      return <StatsRow range={card.range} />;
    case "workflow_started":
      return <WorkflowStartedCard workflow={card.workflow} leadId={card.leadId} />;
    case "actions":
      return <ActionsRow actions={card.actions} onPrompt={onPrompt} />;
    default:
      return null;
  }
}

function LeadCard({ leadId }: { leadId: string }) {
  const { leads } = usePortal();
  const navigate = useNavigate();
  const lead = leads.find((l) => l.id === leadId);
  if (!lead) return null;
  return (
    <div className="chat-card lead-card">
      <div className="lead-card-main">
        <div className="lead-card-name">
          <span className="h3">{fullName(lead)}</span>
          <Badge tone={STATUS_TONE[lead.status]} dot>
            {statusLabel(lead.status)}
          </Badge>
        </div>
        <div className="lead-card-meta">
          <span className="row gap-1">
            <Icon name="map-pin" size={12} />
            {lead.city}, {lead.state}
          </span>
          <span className="row gap-1">
            <Icon name="clock" size={12} />
            Last reached {formatDate(lead.lastReachedAt)}
          </span>
          <span className="mono tiny faint">{lead.id}</span>
        </div>
      </div>
      <div className="lead-card-actions">
        <Button variant="ghost" size="sm" icon="activity" onClick={() => navigate(`/activity/${lead.id}`)}>
          Open activity feed
        </Button>
        <Button variant="primary" size="sm" icon="zap" onClick={() => navigate(`/command-center/${lead.id}`)}>
          Start workflow
        </Button>
      </div>
    </div>
  );
}

function StatsRow({ range }: { range: StatRange }) {
  const { getStats } = usePortalActions();
  const stats = getStats(range);
  return (
    <div className="chat-stats" role="list" aria-label="Performance">
      {stats.map((s) => (
        <div key={s.key} className="chat-stat" role="listitem">
          <span className="chat-stat-label">{s.label}</span>
          <span className="chat-stat-value">
            {formatNumber(s.value)}
            <span className={s.deltaPct >= 0 ? "chat-stat-delta up" : "chat-stat-delta down"}>
              {s.deltaPct >= 0 ? "+" : ""}
              {s.deltaPct}%
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function WorkflowStartedCard({ workflow, leadId }: { workflow: WorkflowKind; leadId?: string }) {
  const { leads } = usePortal();
  const navigate = useNavigate();
  const def = WORKFLOW_BY_KIND[workflow];
  const lead = leadId ? leads.find((l) => l.id === leadId) : undefined;
  return (
    <div className="chat-card workflow-card">
      <span className="workflow-card-icon">
        <Icon name={def.icon} size={16} />
      </span>
      <div className="workflow-card-body">
        <div className="workflow-card-title">
          <span className="h3">{def.label} started</span>
          {lead ? <span className="muted"> · for {fullName(lead)}</span> : null}
        </div>
        <div className="small faint">{lead ? "Queued inside contact hours · agent will call, text and email until the goal is met" : def.description}</div>
      </div>
      <button type="button" className="workflow-card-link" onClick={() => navigate(lead ? `/activity/${lead.id}` : "/activity")}>
        View in Activity
        <Icon name="arrow-up-right" size={13} />
      </button>
    </div>
  );
}

function ActionsRow({ actions, onPrompt }: { actions: { label: string; prompt: string }[]; onPrompt: (prompt: string) => void }) {
  const navigate = useNavigate();
  return (
    <div className="chat-actions" role="group" aria-label="Suggested actions">
      {actions.map((a) => (
        <Chip key={a.label + a.prompt} size="sm" icon={a.prompt === "/wallet" ? "wallet" : "sparkle"} onClick={() => (a.prompt === "/wallet" ? navigate("/wallet") : onPrompt(a.prompt))}>
          {a.label}
        </Chip>
      ))}
    </div>
  );
}
