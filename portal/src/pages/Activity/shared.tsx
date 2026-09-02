import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import type { IconName, Lead, LeadStatus, LeadWorkflowStatus } from "@/types";
import { WORKFLOWS } from "@/data/workflows";
import { usePortalActions } from "@/store/PortalProvider";
import { Badge, Button, Field, Icon, Input, Modal, Textarea, useToast } from "@/components/ui";
import { clsx, fullName } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Status metadata                                                     */
/* ------------------------------------------------------------------ */

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export const STATUS_META: Record<LeadStatus, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "warning" },
  contacted: { label: "Contacted", tone: "info" },
  appointment_set: { label: "Appointment set", tone: "success" },
  cancel_recovered: { label: "Cancel recovered", tone: "success" },
  referral: { label: "Referral", tone: "accent" },
  opted_out: { label: "Opted out", tone: "danger" },
  closed_won: { label: "Closed won", tone: "accent" },
  closed_lost: { label: "Closed lost", tone: "neutral" },
};

export const LEAD_STATUSES = Object.keys(STATUS_META) as LeadStatus[];

export const WORKFLOW_STATUS_META: Record<LeadWorkflowStatus, { label: string; tone: Tone; dot?: boolean }> = {
  active: { label: "Active", tone: "accent", dot: true },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Completed", tone: "success" },
  opted_out: { label: "Opted Out", tone: "danger" },
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  const m = STATUS_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function outcomeTone(outcome: string): Tone {
  const o = outcome.toLowerCase();
  if (/set|recovered|passed|confirmed|booked/.test(o)) return "success";
  if (/not interested|opt|declin/.test(o)) return "danger";
  if (/callback/.test(o)) return "info";
  return "neutral";
}

/* ------------------------------------------------------------------ */
/* Media query hook                                                    */
/* ------------------------------------------------------------------ */

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/* ------------------------------------------------------------------ */
/* Start-workflow popover menu                                         */
/* ------------------------------------------------------------------ */

const MENU_W = 256;

export function WorkflowMenu({ lead, size = "sm", label = "start workflow", className }: { lead: Lead; size?: "sm" | "md"; label?: string; className?: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const estH = 44 * (WORKFLOWS.length + 1) + 44;
    const up = window.innerHeight - r.bottom < estH + 12 && r.top > estH + 12;
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left, up });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        anchorRef.current?.querySelector("button")?.focus();
      }
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    const t = window.setTimeout(() => menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
      window.clearTimeout(t);
    };
  }, [open]);

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next].focus();
  };

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <span ref={anchorRef} className={clsx("wfmenu-anchor", className)}>
      <Button variant="primary" size={size} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label}
      </Button>
      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              className={clsx("wfmenu", pos.up && "wfmenu-up")}
              role="menu"
              aria-label={`Start a workflow for ${fullName(lead)}`}
              style={{ top: pos.top, left: pos.left, width: MENU_W }}
              onKeyDown={onMenuKey}
            >
              <div className="wfmenu-head eyebrow">Start workflow · {lead.firstName}</div>
              {WORKFLOWS.map((w) => (
                <button key={w.kind} type="button" role="menuitem" className="wfmenu-item" onClick={() => go(`/command-center/${lead.id}?workflow=${w.kind}`)}>
                  <span className="wfmenu-icon">
                    <Icon name={w.icon} size={15} />
                  </span>
                  <span className="wfmenu-label">{w.label}</span>
                  <Icon name="chevron-right" size={14} className="wfmenu-chev" />
                </button>
              ))}
              <div className="wfmenu-sep" />
              <button type="button" role="menuitem" className="wfmenu-item" onClick={() => go(`/command-center/${lead.id}`)}>
                <span className="wfmenu-icon">
                  <Icon name="sparkle" size={15} />
                </span>
                <span className="wfmenu-label">Custom command…</span>
                <Icon name="arrow-right" size={14} className="wfmenu-chev" />
              </button>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Edit lead modal                                                     */
/* ------------------------------------------------------------------ */

type EditForm = Pick<Lead, "firstName" | "lastName" | "phone" | "email" | "address" | "city" | "state" | "zip" | "notes">;

function toForm(l: Lead): EditForm {
  return { firstName: l.firstName, lastName: l.lastName, phone: l.phone, email: l.email, address: l.address, city: l.city, state: l.state, zip: l.zip, notes: l.notes };
}

export function EditLeadModal({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  if (!lead) return null;
  return <EditLeadForm key={lead.id} lead={lead} onClose={onClose} />;
}

function EditLeadForm({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { updateLead } = usePortalActions();
  const toast = useToast();
  const [form, setForm] = useState<EditForm>(() => toForm(lead));
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof EditForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    updateLead(lead.id, { ...form, firstName: form.firstName.trim(), lastName: form.lastName.trim(), state: form.state.trim().toUpperCase() });
    toast(`Saved changes to ${form.firstName.trim()} ${form.lastName.trim()}`, "success");
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Edit lead" size="lg">
      <form onSubmit={submit} className="stack gap-4">
        <div className="row gap-2 wrap">
          <Badge mono>{lead.id}</Badge>
          <StatusBadge status={lead.status} />
        </div>
        <div className="field-grid">
          <Field label="First name" required htmlFor="el-first">
            <Input id="el-first" value={form.firstName} onChange={set("firstName")} autoComplete="off" />
          </Field>
          <Field label="Last name" required htmlFor="el-last">
            <Input id="el-last" value={form.lastName} onChange={set("lastName")} autoComplete="off" />
          </Field>
          <Field label="Phone" htmlFor="el-phone" hint="E.164, e.g. +18155550123">
            <Input id="el-phone" value={form.phone} onChange={set("phone")} inputMode="tel" />
          </Field>
          <Field label="Email" htmlFor="el-email">
            <Input id="el-email" type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Address" htmlFor="el-address" className="span-2">
            <Input id="el-address" value={form.address} onChange={set("address")} />
          </Field>
          <Field label="City" htmlFor="el-city">
            <Input id="el-city" value={form.city} onChange={set("city")} />
          </Field>
          <div className="act-edit-row">
            <Field label="State" htmlFor="el-state">
              <Input id="el-state" value={form.state} onChange={set("state")} maxLength={3} className="mono" />
            </Field>
            <Field label="ZIP" htmlFor="el-zip">
              <Input id="el-zip" value={form.zip} onChange={set("zip")} inputMode="numeric" />
            </Field>
          </div>
          <Field label="Notes" htmlFor="el-notes" className="span-2">
            <Textarea id="el-notes" value={form.notes} onChange={set("notes")} rows={3} />
          </Field>
        </div>
        {error ? (
          <div className="act-form-error" role="alert">
            <Icon name="alert" size={14} /> {error}
          </div>
        ) : null}
        <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon="check">
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Archive (soft delete) modal                                         */
/* ------------------------------------------------------------------ */

export function ArchiveLeadModal({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const { updateLead } = usePortalActions();
  const toast = useToast();
  if (!lead) return null;
  const confirm = () => {
    updateLead(lead.id, { status: "closed_lost" });
    toast("Lead archived", "success");
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Archive lead?">
      <div className="stack gap-4">
        <p className="muted">
          <strong style={{ color: "var(--text)" }}>{fullName(lead)}</strong> will be marked <em>Closed lost</em> and every active workflow will stop reaching out. You can still open their activity feed later.
        </p>
        <div className="act-archive-card">
          <Icon name="alert" size={16} />
          <span>This does not delete transcripts, texts or emails already recorded.</span>
        </div>
        <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={onClose}>
            Keep lead
          </Button>
          <Button variant="danger" icon="trash" onClick={confirm}>
            Archive lead
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export const ACTIVITY_ICON: Record<string, IconName> = {
  lead_generated: "users",
  appointment_set: "calendar",
  cancel_recovered: "refresh",
  referral_generated: "gift",
  talent_inquiry: "briefcase",
  call: "phone",
  sms: "message",
  email: "mail",
  opted_out: "alert",
  workflow_started: "zap",
};

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
