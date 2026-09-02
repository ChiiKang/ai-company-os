import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type FormEvent } from "react";
import type { SupportTicket } from "@/types";
import { Badge, Button, Card, Field, Icon, Input, Select, Textarea, useToast } from "@/components/ui";
import { usePortal, usePortalActions } from "@/store/PortalProvider";
import { timeAgo } from "@/lib/format";

type Category = SupportTicket["category"];

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "billing", label: "Billing" },
  { value: "agent", label: "Agent behaviour" },
  { value: "integration", label: "Integrations" },
  { value: "bug", label: "Bug" },
  { value: "other", label: "Other" },
];

const STATUS: Record<SupportTicket["status"], { label: string; tone: "info" | "warning" | "success" }> = {
  open: { label: "Open", tone: "info" },
  in_progress: { label: "In progress", tone: "warning" },
  resolved: { label: "Resolved", tone: "success" },
};

export interface TicketPanelHandle {
  /** Scrolls the form into view and prefills the message. */
  prefill: (message: string) => void;
}

export const TicketPanel = forwardRef<TicketPanelHandle>(function TicketPanel(_, ref) {
  const { tickets, user } = usePortal();
  const { createTicket } = usePortalActions();
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState<SupportTicket | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const focusSubject = () => cardRef.current?.querySelector<HTMLInputElement>("#sp-subject")?.focus();
  const fileRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  useImperativeHandle(ref, () => ({
    prefill: (q: string) => {
      setCreated(null);
      setMessage(q);
      setSubject((s) => s || q.slice(0, 60));
      setTouched(false);
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(focusSubject, 350);
    },
  }));

  const subjectErr = subject.trim().length < 3 ? "Add a subject of at least 3 characters." : null;
  const messageErr = message.trim().length < 10 ? "Tell us a little more — at least 10 characters." : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (subjectErr || messageErr) return;
    const attach = files.length ? `\n\nAttachments: ${files.join(", ")}` : "";
    const t = createTicket({ subject: subject.trim(), category, message: message.trim() + attach });
    setCreated(t);
    toast(`Ticket ${t.id} created`, "success");
  };

  const reset = () => {
    setCreated(null);
    setSubject("");
    setCategory("other");
    setMessage("");
    setFiles([]);
    setTouched(false);
    window.setTimeout(focusSubject, 0);
  };

  return (
    <div ref={cardRef} id="sp-ticket" style={{ scrollMarginTop: 24 }}>
    <Card>
      <div className="sp-card-head">
        <h2 className="h2">Open a ticket</h2>
        <span className="sp-card-sub">Humans within the hour</span>
      </div>

      {created ? (
        <div className="sp-success" role="status">
          <span className="sp-success-icon"><Icon name="check" size={20} strokeWidth={2.5} /></span>
          <div className="h3">Ticket <span className="mono">{created.id}</span> created</div>
          <p className="small muted">We'll reply to <strong>{user.email}</strong>. Most tickets get a first response in under an hour.</p>
          <Button variant="ghost" size="sm" icon="plus" onClick={reset} style={{ marginTop: 6 }}>New ticket</Button>
        </div>
      ) : (
        <form className="sp-form" onSubmit={submit} noValidate>
          <Field label="Subject" required htmlFor="sp-subject" error={touched && subjectErr}>
            <Input id="sp-subject" value={subject} placeholder="Short summary" maxLength={120} invalid={touched && !!subjectErr} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Category" htmlFor="sp-category">
            <Select id="sp-category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Message" required htmlFor="sp-message" error={touched && messageErr} meta={`${message.trim().length} chars`}>
            <Textarea id="sp-message" value={message} rows={4} placeholder="What happened, and which lead or workflow is it about?" invalid={touched && !!messageErr} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <div className="sp-attach">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              aria-label="Attach files"
              onChange={(e) => {
                const names = Array.from(e.target.files ?? []).map((f) => f.name);
                setFiles((fs) => Array.from(new Set([...fs, ...names])));
                e.target.value = "";
              }}
            />
            <Button variant="ghost" size="sm" icon="paperclip" onClick={() => fileRef.current?.click()}>Attach</Button>
            {files.map((f) => (
              <span key={f} className="sp-attach-pill">
                <Icon name="file" size={12} />
                <span className="truncate">{f}</span>
                <button type="button" aria-label={`Remove ${f}`} onClick={() => setFiles((fs) => fs.filter((x) => x !== f))}>
                  <Icon name="x" size={12} />
                </button>
              </span>
            ))}
          </div>
          <div className="sp-form-foot">
            <span className="tiny faint">Replies go to {user.email}</span>
            <Button type="submit" variant="primary" iconRight="arrow-right">Send ticket</Button>
          </div>
        </form>
      )}

      <div className="sp-tickets">
        <span className="eyebrow">Your tickets{tickets.length ? ` (${tickets.length})` : ""}</span>
        {tickets.length ? (
          <ul>
            {tickets.map((t) => (
              <li key={t.id} className="sp-ticket">
                <span className="mono">{t.id}</span>
                <span className="sp-ticket-subject">
                  <span className="truncate">{t.subject}</span>
                  <span className="tiny">{timeAgo(t.createdAt, now)}</span>
                </span>
                <Badge tone={STATUS[t.status].tone} dot>{STATUS[t.status].label}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <div className="sp-tickets-empty">No tickets yet.</div>
        )}
      </div>
    </Card>
    </div>
  );
});
