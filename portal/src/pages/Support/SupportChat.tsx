import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, Button, Card, Chip, Icon, Textarea, useToast } from "@/components/ui";
import { Logo } from "@/components/shell/Logo";
import { clsx, uid } from "@/lib/format";
import { matchKb } from "./kb";
import { MarkdownLite } from "./Markdown";

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  status: "thinking" | "streaming" | "done";
  relatedRoute?: { path: string; label: string };
  /** Set on the fallback reply: offers to open a ticket with the original question. */
  ticketQuestion?: string;
  feedback?: "up" | "down";
}

const SUGGESTIONS = [
  "How do agents decide when to call?",
  "How do usage credits work?",
  "What does Advanced mode with USDC unlock?",
  "How do I connect Google Calendar?",
  "Can I pause a workflow?",
];

const WORD_MS = 14;
const THINK_MS = 420;

function fallbackAnswer(): string {
  return "I couldn't find a confident answer to that in my notes yet. I don't want to guess about your account, so let's get a person on it.\n\n- Open a ticket below and I'll attach your question\n- Or email **support@energyengine.ai** — median first reply is 38 minutes\n\nIn the meantime, try asking about workflows, credits, calendars or your agent's voice.";
}

export function SupportChat({ userName, userInitials, onOpenTicket }: { userName: string; userInitials: string; onOpenTicket: (question: string) => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const first = userName.split(" ")[0] || "there";
  const [messages, setMessages] = useState<Msg[]>(() => [
    { id: uid("m"), role: "assistant", text: `Hi ${first} — I'm the EnergyEngine assistant. Ask me anything about your workflows, credits, integrations or agents. Answers are instant; a human is one click away if I can't help.`, status: "done" },
  ]);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const timers = useRef<number[]>([]);
  const busy = messages.some((m) => m.status !== "done");
  const asked = messages.some((m) => m.role === "user");

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const patchMsg = useCallback((id: string, patch: Partial<Msg> | ((m: Msg) => Partial<Msg>)) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)));
  }, []);

  const ask = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q || busy) return;
      const match = matchKb(q);
      const answer = match ? match.entry.answer : fallbackAnswer();
      const reply: Msg = {
        id: uid("m"),
        role: "assistant",
        text: "",
        status: "thinking",
        relatedRoute: match?.entry.relatedRoute,
        ticketQuestion: match ? undefined : q,
      };
      setMessages((ms) => [...ms, { id: uid("m"), role: "user", text: q, status: "done" }, reply]);
      setDraft("");

      const words = answer.split(/(?<=\s)/); // keep whitespace (incl. newlines) attached to each word
      let i = 0;
      const tick = () => {
        i += 1;
        const partial = words.slice(0, i).join("");
        patchMsg(reply.id, { text: partial, status: i >= words.length ? "done" : "streaming" });
        if (i < words.length) timers.current.push(window.setTimeout(tick, WORD_MS));
      };
      timers.current.push(window.setTimeout(tick, THINK_MS));
    },
    [busy, patchMsg],
  );

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(draft);
    }
  };

  const feedback = (id: string, v: "up" | "down") => {
    patchMsg(id, (m) => ({ feedback: m.feedback === v ? undefined : v }));
    toast(v === "up" ? "Thanks — glad that helped." : "Thanks — we'll improve this answer.", "success");
  };

  const reset = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setMessages((ms) => ms.slice(0, 1));
    setDraft("");
    formRef.current?.querySelector("textarea")?.focus();
  };

  return (
    <Card className="sp-chat" pad={false} accent>
      <div className="sp-chat-head">
        <span className="sp-logo">
          <Logo size={20} />
        </span>
        <div className="sp-chat-title">
          <h2 className="h2">Ask EnergyEngine</h2>
          <span className="sp-chat-sub">Instant answers from the product team's notes · no waiting</span>
        </div>
        {asked ? <Button variant="ghost" size="sm" icon="refresh" onClick={reset}>New chat</Button> : null}
      </div>

      <div className="sp-msgs" ref={listRef} role="log" aria-live="polite" aria-label="Support conversation">
        {messages.map((m) => (
          <div key={m.id} className={clsx("sp-msg", m.role === "user" ? "sp-msg-user" : "sp-msg-assistant")}>
            {m.role === "user" ? (
              <Avatar initials={userInitials} size="sm" />
            ) : (
              <span className="sp-logo sp-logo-sm" aria-label="EnergyEngine assistant">
                <Logo size={16} />
              </span>
            )}
            <div className="sp-msg-body">
              {m.status === "thinking" ? (
                <span className="sp-thinking" aria-label="Thinking"><i /><i /><i /></span>
              ) : m.role === "user" ? (
                <span>{m.text}</span>
              ) : (
                <MarkdownLite text={m.text} caret={m.status === "streaming"} />
              )}
              {m.role === "assistant" && m.status === "done" && messages[0].id !== m.id ? (
                <div className="sp-msg-foot">
                  {m.relatedRoute ? (
                    <Chip size="sm" icon="arrow-up-right" onClick={() => navigate(m.relatedRoute!.path)}>
                      Open {m.relatedRoute.label}
                    </Chip>
                  ) : null}
                  {m.ticketQuestion ? (
                    <Chip size="sm" icon="lifebuoy" onClick={() => onOpenTicket(m.ticketQuestion!)}>
                      Open a ticket with this question
                    </Chip>
                  ) : null}
                  <span className="sp-spacer" />
                  <span className="sp-helpful">
                    <span>Was this helpful?</span>
                    <button type="button" className="sp-thumb" aria-label="Yes, helpful" aria-pressed={m.feedback === "up"} onClick={() => feedback(m.id, "up")}>
                      <Icon name="check" size={14} />
                    </button>
                    <button type="button" className="sp-thumb" aria-label="No, not helpful" aria-pressed={m.feedback === "down"} onClick={() => feedback(m.id, "down")}>
                      <Icon name="x" size={14} />
                    </button>
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className={clsx("sp-suggest", asked && "sp-suggest-compact")} aria-label="Suggested questions">
        {SUGGESTIONS.map((s) => (
          <Chip key={s} size="sm" icon="sparkle" disabled={busy} onClick={() => ask(s)}>
            {s}
          </Chip>
        ))}
      </div>

      <form
        ref={formRef}
        className="sp-composer"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <label htmlFor="sp-composer" className="sr-only">Ask a question</label>
        <Textarea id="sp-composer" rows={1} value={draft} placeholder="Ask anything about EnergyEngine…" onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />
        <Button type="submit" variant="primary" icon="send" aria-label="Send" disabled={!draft.trim() || busy} />
      </form>
      <div className="sp-composer-hint">
        <span>Enter to send · Shift+Enter for a new line</span>
        <span>Answered locally, in your browser</span>
      </div>
    </Card>
  );
}
