import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { WorkflowKind } from "@/types";
import { usePortal } from "@/store/PortalProvider";
import { WORKFLOWS, WORKFLOW_BY_KIND } from "@/data/workflows";
import { Logo } from "@/components/shell/Logo";
import { Button, Chip, Icon } from "@/components/ui";
import { Composer } from "@/components/chat/Composer";
import { MessageList } from "@/components/chat/MessageList";
import { useAgentChat } from "@/components/chat/useAgentChat";
import { formatDate, fullName } from "@/lib/format";
import { LeadContextCard, PerformanceDashboard, RecentActivity } from "./Dashboard";
import "@/components/chat/chat.css";
import "./command-center.css";

const KINDS = new Set<string>(WORKFLOWS.map((w) => w.kind));
function parseWorkflow(v: string | null): WorkflowKind | undefined {
  return v && KINDS.has(v) ? (v as WorkflowKind) : undefined;
}

export function CommandCenterPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { leads } = usePortal();

  const lead = useMemo(() => (leadId ? leads.find((l) => l.id === leadId) : undefined), [leads, leadId]);
  const leadName = lead ? fullName(lead) : undefined;

  const initialWorkflow = parseWorkflow(params.get("workflow"));
  const [workflow, setWorkflow] = useState<WorkflowKind | undefined>(initialWorkflow);
  const [input, setInput] = useState(() => (initialWorkflow ? promptFor(initialWorkflow, leadName) : ""));

  /* Reset composer + chip when the context changes (global ↔ lead, or a new ?workflow=). */
  useEffect(() => {
    setWorkflow(initialWorkflow);
    setInput(initialWorkflow ? promptFor(initialWorkflow, leadName) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, initialWorkflow]);

  const chat = useAgentChat(leadId, workflow);
  const hasThread = chat.messages.length > 0;

  const selectWorkflow = useCallback(
    (kind: WorkflowKind) => {
      if (workflow === kind) {
        setWorkflow(undefined);
        setInput("");
        return;
      }
      setWorkflow(kind);
      setInput(promptFor(kind, leadName));
    },
    [workflow, leadName],
  );

  const handleSend = useCallback(
    (text: string, files: string[]) => {
      setInput("");
      void chat.send(text, { files });
      setWorkflow(undefined);
    },
    [chat],
  );

  const handlePrompt = useCallback(
    (prompt: string) => {
      setInput("");
      void chat.send(prompt);
    },
    [chat],
  );

  const placeholder = leadName ? `How can I help with ${leadName}? (Select a workflow above or type a command)` : "How can I help? …";

  const composer = (
    <Composer
      value={input}
      onChange={setInput}
      onSend={handleSend}
      onStop={chat.stop}
      streaming={chat.streaming}
      placeholder={placeholder}
      adapterName={chat.adapterName}
      autoFocus={!hasThread}
    />
  );

  const chips = (
    <div className="cc-chips" role="group" aria-label="Workflows">
      {WORKFLOWS.map((w) => (
        <Chip key={w.kind} icon={w.icon} active={workflow === w.kind} onClick={() => selectWorkflow(w.kind)} title={w.description}>
          {w.label}
        </Chip>
      ))}
    </div>
  );

  return (
    <div className={hasThread ? "cc has-thread" : "cc"}>
      <section className="cc-stage" aria-label="Agent chat">
        {hasThread ? (
          <>
            <header className="cc-thread-head">
              <div className="cc-context">
                {lead ? (
                  <span className="cc-context-pill">
                    <Icon name="user" size={13} />
                    <span className="truncate">{leadName}</span>
                    <button type="button" className="cc-context-x" aria-label="Clear lead context" title="Clear lead context" onClick={() => navigate("/")}>
                      <Icon name="x" size={12} strokeWidth={2.2} />
                    </button>
                  </span>
                ) : (
                  <span className="cc-context-pill is-global">
                    <Logo size={13} />
                    Agent Command Center
                  </span>
                )}
                {workflow ? (
                  <span className="cc-context-wf">
                    <Icon name={WORKFLOW_BY_KIND[workflow].icon} size={12} />
                    {WORKFLOW_BY_KIND[workflow].label}
                  </span>
                ) : null}
              </div>
              <Button variant="ghost" size="sm" icon="plus" onClick={chat.clear}>
                New chat
              </Button>
            </header>
            <MessageList messages={chat.messages} draft={chat.draft} streaming={chat.streaming} onPrompt={handlePrompt} onRetry={() => void chat.retry()} />
            {hasThread ? <div className="cc-thread-chips">{chips}</div> : null}
            <div className="cc-composer-dock">{composer}</div>
          </>
        ) : (
          <div className="cc-empty">
            <div className="cc-hero fade-up">
              <span className="cc-hero-mark" aria-hidden="true">
                <Logo size={44} />
              </span>
              <h1 className="h-display cc-title">{leadName ? `Agent Command Center for ${leadName}` : "Agent Command Center"}</h1>
              {lead ? (
                <p className="cc-lead-line mono">
                  <span>Lead ID: {lead.id}</span>
                  <span className="cc-sep">|</span>
                  <span>Last Reached: {formatDate(lead.lastReachedAt)}</span>
                </p>
              ) : (
                <p className="cc-tagline">Your sales agents, on command.</p>
              )}
            </div>
            <div className="cc-empty-chips fade-up">{chips}</div>
            <div className="cc-empty-composer fade-up">{composer}</div>
          </div>
        )}
      </section>

      <aside className="cc-side" aria-label="Performance and activity">
        {lead ? <LeadContextCard lead={lead} /> : null}
        <PerformanceDashboard />
        <RecentActivity />
      </aside>
    </div>
  );
}

function promptFor(kind: WorkflowKind, leadName?: string): string {
  const def = WORKFLOW_BY_KIND[kind];
  return leadName ? def.leadPrompt.replace("{name}", leadName) : def.examplePrompt;
}
