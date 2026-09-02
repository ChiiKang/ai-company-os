import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ActivityEvent, CallRecord, EmailRecord, IconName, Lead, LeadWorkflow, MessageRecord } from "@/types";
import { usePortal } from "@/store/PortalProvider";
import { Accordion, Badge, Button, Card, EmptyState, Icon, useToast } from "@/components/ui";
import { clsx, formatDate, formatDateTime, formatDuration, formatPhone, formatTime, fullName, timeAgo } from "@/lib/format";
import { ACTIVITY_ICON, StatusBadge, WORKFLOW_STATUS_META, outcomeTone, plural } from "./shared";
import "./activity.css";

/* ------------------------------------------------------------------ */
/* Timeline model                                                      */
/* ------------------------------------------------------------------ */

interface TimelineItem {
  id: string;
  at: string;
  icon: IconName;
  title: string;
  line?: string;
}

function buildTimeline(lead: Lead, activity: ActivityEvent[]): TimelineItem[] {
  const items: TimelineItem[] = activity
    .filter((a) => a.leadId === lead.id)
    .map((a) => ({ id: a.id, at: a.at, icon: ACTIVITY_ICON[a.kind] ?? "activity", title: a.title, line: a.lines[0] }));
  for (const wf of lead.workflows) {
    items.push({ id: `wf-${wf.id}`, at: wf.startedAt, icon: "zap", title: `${wf.label} started`, line: wf.contactHours });
    for (const c of wf.calls) items.push({ id: `call-${wf.id}-${c.id}`, at: c.at, icon: "phone", title: `Call · ${c.outcome}`, line: c.durationSec ? formatDuration(c.durationSec) : "Not answered" });
    for (const s of wf.sms) items.push({ id: `sms-${wf.id}-${s.id}`, at: s.at, icon: "message", title: s.direction === "outbound" ? "Text sent" : `Reply from ${lead.firstName}`, line: s.text });
    for (const e of wf.emails) items.push({ id: `em-${wf.id}-${e.id}`, at: e.at, icon: "mail", title: e.direction === "outbound" ? "Email sent" : "Email received", line: e.subject });
  }
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function LeadDetailPage() {
  const { leadId = "" } = useParams();
  const { leads, activity } = usePortal();
  const navigate = useNavigate();
  const toast = useToast();
  const lead = leads.find((l) => l.id === leadId);
  const timeline = useMemo(() => (lead ? buildTimeline(lead, activity) : []), [lead, activity]);

  if (!lead) {
    return (
      <div className="page ld fade-up">
        <Link to="/activity" className="ld-back">
          <Icon name="arrow-left" size={15} /> Back to Activity
        </Link>
        <Card pad="lg" style={{ marginTop: 20 }}>
          <EmptyState
            icon="search"
            title="Lead not found"
            action={
              <Button variant="secondary" size="sm" icon="activity" onClick={() => navigate("/activity")}>
                Back to Activity
              </Button>
            }
          >
            There is no lead with ID <span className="mono">{leadId || "—"}</span>. It may have been removed or the link is out of date.
          </EmptyState>
        </Card>
      </div>
    );
  }

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(lead.id);
      toast(`Lead ID ${lead.id} copied`, "success");
    } catch {
      toast("Couldn't copy to clipboard", "error");
    }
  };

  const workflows = [...lead.workflows].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  const info: [string, ReactNode][] = [
    ["First name", lead.firstName],
    ["Last name", lead.lastName],
    ["Phone", <span className="mono">{formatPhone(lead.phone)}</span>],
    ["Email", lead.email || "—"],
    ["Address", `${lead.address}, ${lead.city} ${lead.state}, ${lead.zip}`],
    ["Notes", lead.notes || <span className="faint">No notes yet</span>],
    ["Source", lead.source],
    ["Lead ID", <span className="mono">{lead.id}</span>],
    ["Created", formatDate(lead.createdAt)],
  ];
  if (lead.systemSizeKw) info.push(["System size", `${lead.systemSizeKw} kW`]);

  return (
    <div className="page ld fade-up">
      <Link to="/activity" className="ld-back">
        <Icon name="arrow-left" size={15} /> Back to Activity
      </Link>

      <header className="ld-head">
        <div className="ld-head-main">
          <div className="ld-title-row">
            <h1 className="h-display ld-title">{fullName(lead)}</h1>
            <StatusBadge status={lead.status} />
          </div>
          <p className="muted ld-meta">
            <span className="mono">{formatPhone(lead.phone)}</span>
            <span className="ld-dot" aria-hidden="true">·</span>
            {lead.address}, {lead.city} {lead.state}, {lead.zip}
          </p>
        </div>
        <div className="ld-actions">
          <Button variant="primary" icon="zap" onClick={() => navigate(`/command-center/${lead.id}`)}>
            Start workflow
          </Button>
          <Button variant="secondary" icon="message" onClick={() => navigate(`/command-center/${lead.id}`)}>
            Ask the agent
          </Button>
          <Button variant="ghost" icon="copy" aria-label="Copy lead ID" title={`Copy ${lead.id}`} onClick={copyId} />
        </div>
      </header>

      <div className="ld-layout">
        <div className="ld-main">
          <Card className="ld-info-card">
            <div className="ld-card-head">
              <h2 className="h2">Lead Information</h2>
              <span className="small faint">Last reached {timeAgo(lead.lastReachedAt)}</span>
            </div>
            <dl className="ld-info">
              {info.map(([k, v]) => (
                <div key={k} className={clsx("ld-kv", (k === "Address" || k === "Notes") && "ld-kv-wide")}>
                  <dt className="eyebrow">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <section className="ld-workflows" aria-labelledby="ld-wf-heading">
            <div className="ld-section-head">
              <h2 className="h2" id="ld-wf-heading">Workflows</h2>
              <span className="small faint">{plural(workflows.length, "workflow")}</span>
            </div>
            {workflows.length === 0 ? (
              <Card pad="lg">
                <EmptyState
                  icon="zap"
                  title="No workflows yet"
                  action={
                    <Button variant="primary" size="sm" onClick={() => navigate(`/command-center/${lead.id}`)}>
                      Start one
                    </Button>
                  }
                >
                  Start a workflow and every call, text and email will show up here.
                </EmptyState>
              </Card>
            ) : (
              workflows.map((wf, i) => <WorkflowCard key={wf.id} wf={wf} lead={lead} defaultOpen={i === 0} />)
            )}
          </section>
        </div>

        <aside className="ld-rail" aria-label="Timeline">
          <Card className="ld-timeline-card">
            <div className="ld-card-head">
              <h2 className="h2">Timeline</h2>
              <span className="small faint">{plural(timeline.length, "event")}</span>
            </div>
            {timeline.length === 0 ? (
              <p className="small faint">Nothing recorded for this lead yet.</p>
            ) : (
              <ol className="ld-timeline">
                {timeline.map((t) => (
                  <li key={t.id} className="ld-tl-item">
                    <span className="ld-tl-icon">
                      <Icon name={t.icon} size={13} />
                    </span>
                    <div className="ld-tl-body">
                      <div className="ld-tl-title">{t.title}</div>
                      {t.line ? <div className="ld-tl-line truncate">{t.line}</div> : null}
                    </div>
                    <time className="ld-tl-time" dateTime={t.at} title={formatDateTime(t.at)}>{timeAgo(t.at)}</time>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Workflow card                                                       */
/* ------------------------------------------------------------------ */

function WorkflowCard({ wf, lead, defaultOpen }: { wf: LeadWorkflow; lead: Lead; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const st = WORKFLOW_STATUS_META[wf.status];
  const bodyId = `wf-body-${wf.id}`;
  return (
    <Card pad={false} className={clsx("ld-wf", open && "is-open")}>
      <button type="button" className="ld-wf-head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
        <span className="ld-wf-title">
          <strong>{wf.label}</strong>
          <Badge tone={st.tone} dot={st.dot}>{st.label}</Badge>
        </span>
        <span className="faint small ld-wf-started">Started: {formatDateTime(wf.startedAt)}</span>
        <Icon name="chevron-down" size={16} className="ld-wf-chev" />
      </button>
      {open ? (
        <div className="ld-wf-body" id={bodyId}>
          <p className="small muted ld-wf-hours">
            <Icon name="clock" size={13} /> Contact hours: {wf.contactHours}
          </p>
          <div className="eyebrow ld-summary-label">Summary</div>
          <div className="ld-summary">{wf.summary || "No calls, texts, or emails have been recorded for this workflow yet."}</div>

          <div className="ld-channels">
            <Accordion title="Voice Calls" icon="phone" summary={wf.calls.length ? plural(wf.calls.length, "call") : "No calls"}>
              {wf.calls.length ? (
                <div className="ld-calls">
                  {wf.calls.map((c) => (
                    <CallBlock key={c.id} call={c} lead={lead} />
                  ))}
                </div>
              ) : (
                <p className="small faint ld-none">No calls recorded for this workflow.</p>
              )}
            </Accordion>
            <Accordion title="SMS Conversation" icon="message" summary={wf.sms.length ? plural(wf.sms.length, "message") : "No messages"}>
              {wf.sms.length ? <SmsThread messages={wf.sms} /> : <p className="small faint ld-none">No text messages recorded for this workflow.</p>}
            </Accordion>
            <Accordion title="Email Conversation" icon="mail" summary={wf.emails.length ? plural(wf.emails.length, "email") : "No emails"}>
              {wf.emails.length ? (
                <div className="ld-emails">
                  {wf.emails.map((e) => (
                    <EmailCard key={e.id} email={e} />
                  ))}
                </div>
              ) : (
                <p className="small faint ld-none">No emails recorded for this workflow.</p>
              )}
            </Accordion>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Calls                                                               */
/* ------------------------------------------------------------------ */

function CallBlock({ call, lead }: { call: CallRecord; lead: Lead }) {
  return (
    <article className="ld-call">
      <header className="ld-call-head">
        <span className="small muted">{formatDateTime(call.at)}</span>
        <Badge tone={outcomeTone(call.outcome)}>{call.outcome}</Badge>
        <span className="mono small faint">{formatDuration(call.durationSec)}</span>
        <span className="grow" />
        {call.durationSec > 0 ? <PlayRecording id={call.id} durationSec={call.durationSec} /> : null}
      </header>
      {call.transcript.length ? (
        <ol className="ld-chat" aria-label="Call transcript">
          {call.transcript.map((t, i) => (
            <li key={i} className={clsx("ld-line", t.speaker === "agent" ? "is-agent" : "is-lead")}>
              <span className="ld-line-label mono">{t.speaker === "agent" ? "Agent" : "Lead"}</span>
              <span className="ld-bubble">{t.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="small faint ld-none">No transcript (call not answered)</p>
      )}
      <span className="sr-only">Call with {fullName(lead)}</span>
    </article>
  );
}

function PlayRecording({ id, durationSec }: { id: string; durationSec: number }) {
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!playing) return;
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - started) / 3000);
      setPct(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const toggle = () => {
    if (playing) {
      setPlaying(false);
      setPct(0);
    } else {
      setPct(0);
      setPlaying(true);
    }
  };
  const elapsed = Math.round(pct * durationSec);
  return (
    <span className="ld-play">
      <Button variant="ghost" size="sm" icon={playing ? "pause" : "play"} onClick={toggle} aria-pressed={playing} aria-controls={`rec-${id}`}>
        {playing ? "Playing" : "Play recording"}
      </Button>
      {playing || pct > 0 ? (
        <span className="ld-play-bar" id={`rec-${id}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label="Recording playback">
          <span className="ld-play-fill" style={{ width: `${pct * 100}%` }} />
          <span className="ld-play-time mono">{formatDuration(elapsed)}</span>
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* SMS / Email                                                         */
/* ------------------------------------------------------------------ */

function SmsThread({ messages }: { messages: MessageRecord[] }) {
  const sorted = [...messages].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return (
    <ol className="ld-sms" aria-label="Text conversation">
      {sorted.map((m) => (
        <li key={m.id} className={clsx("ld-msg", m.direction === "outbound" ? "is-out" : "is-in")}>
          <span className="ld-bubble">{m.text}</span>
          <time className="ld-msg-time tiny faint" dateTime={m.at} title={formatDateTime(m.at)}>
            {m.direction === "outbound" ? "Agent" : "Lead"} · {formatTime(m.at)}
          </time>
        </li>
      ))}
    </ol>
  );
}

function EmailCard({ email }: { email: EmailRecord }) {
  return (
    <article className="ld-email">
      <header className="ld-email-head">
        <strong className="ld-email-subject">{email.subject}</strong>
        <Badge tone={email.direction === "outbound" ? "accent" : "info"}>{email.direction === "outbound" ? "Sent" : "Received"}</Badge>
        <time className="small faint" dateTime={email.at}>{formatDateTime(email.at)}</time>
      </header>
      <p className="ld-email-body">{email.body}</p>
    </article>
  );
}
