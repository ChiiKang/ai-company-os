import { useMemo, useRef, useState } from "react";
import { Accordion, Button, Card, Icon, SearchInput, useToast } from "@/components/ui";
import { usePortal } from "@/store/PortalProvider";
import { formatTime } from "@/lib/format";
import { KB, tokenize } from "./kb";
import { MarkdownLite } from "./Markdown";
import { SupportChat } from "./SupportChat";
import { TicketPanel, type TicketPanelHandle } from "./TicketPanel";
import "./support.css";

const SUPPORT_EMAIL = "support@energyengine.ai";

const RESOURCES: { label: string; icon: "book" | "link" | "activity" | "shield" }[] = [
  { label: "Product guide", icon: "book" },
  { label: "API & integrations", icon: "link" },
  { label: "Status page", icon: "activity" },
  { label: "Privacy", icon: "shield" },
];

export function SupportPage() {
  const { user } = usePortal();
  const ticketRef = useRef<TicketPanelHandle>(null);

  return (
    <div className="page fade-up">
      <header className="sp-head">
        <h1 className="h-display">Support</h1>
        <p className="sp-sub">Answers in seconds. Humans within the hour.</p>
      </header>

      <div className="sp-grid">
        <div className="sp-main">
          <SupportChat userName={user.name} userInitials={user.initials} onOpenTicket={(q) => ticketRef.current?.prefill(q)} />
          <FaqCard />
        </div>
        <aside className="sp-side">
          <ContactCard />
          <TicketPanel ref={ticketRef} />
          <Card pad={false}>
            <nav className="sp-resources" aria-label="Resources">
              {RESOURCES.map((r) => (
                <a key={r.label} className="btn btn-ghost" href="#" onClick={(e) => e.preventDefault()}>
                  <Icon name={r.icon} size={16} />
                  {r.label}
                  <Icon name="external" size={14} />
                </a>
              ))}
            </nav>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FaqCard() {
  const [q, setQ] = useState("");
  const faqs = useMemo(() => KB.filter((e) => e.faq).slice(0, 8), []);
  const shown = useMemo(() => {
    const t = tokenize(q);
    if (!t.length) return faqs;
    return faqs.filter((e) => {
      const hay = new Set([...tokenize(e.question), ...tokenize(e.answer), ...e.keywords]);
      return t.some((x) => hay.has(x) || e.question.toLowerCase().includes(x));
    });
  }, [q, faqs]);

  return (
    <Card className="sp-faq">
      <div className="sp-card-head">
        <h2 className="h2">Frequently asked</h2>
        <span className="sp-card-sub">{shown.length} of {faqs.length}</span>
      </div>
      <SearchInput className="sp-faq-search" value={q} placeholder="Filter questions…" aria-label="Filter FAQs" onChange={(e) => setQ(e.target.value)} />
      {shown.length ? (
        shown.map((e) => (
          <Accordion key={e.id} title={e.question}>
            <MarkdownLite text={e.answer} />
          </Accordion>
        ))
      ) : (
        <div className="sp-faq-empty">Nothing matches "{q}". Try the chat above — it knows more.</div>
      )}
    </Card>
  );
}

function ContactCard() {
  const toast = useToast();
  const updated = useMemo(() => formatTime(new Date().toISOString()), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      toast("Copied", "success");
    } catch {
      toast(SUPPORT_EMAIL);
    }
  };

  return (
    <Card>
      <div className="sp-card-head">
        <h2 className="h2">Contact</h2>
      </div>
      <div className="sp-contact-row">
        <a className="sp-contact-mail" href={`mailto:${SUPPORT_EMAIL}`}>
          <Icon name="mail" size={15} />
          <span className="truncate">{SUPPORT_EMAIL}</span>
        </a>
        <Button variant="secondary" icon="copy" aria-label="Copy support email" onClick={copy} />
      </div>
      <div className="sp-lines">
        <div className="sp-line">
          <Icon name="clock" size={14} />
          <span>Median first reply: <strong>38 minutes</strong></span>
        </div>
        <div className="sp-line">
          <span className="sp-dot" aria-hidden="true" />
          <span>All systems operational</span>
          <span className="faint">Updated {updated}</span>
        </div>
      </div>
    </Card>
  );
}
