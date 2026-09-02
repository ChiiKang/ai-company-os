import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import type { IconName } from "@/types";
import { clsx } from "@/lib/format";
import { Icon } from "./Icon";
import "./ui.css";

export { Icon };

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger" | "usdc";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  square?: boolean;
  block?: boolean;
}

export function Button({ variant = "secondary", size = "md", icon, iconRight, loading, square, block, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  const iconOnly = !children && (icon || iconRight);
  return (
    <button
      type={type}
      className={clsx("btn", `btn-${variant}`, size !== "md" && `btn-${size}`, iconOnly && "btn-icon", square && "btn-square", block && "btn-block", className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Icon name="loader" size={16} className="spinner" /> : icon ? <Icon name={icon} size={size === "sm" ? 14 : 16} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={size === "sm" ? 14 : 16} /> : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Card / Badge / Chip / Avatar                                        */
/* ------------------------------------------------------------------ */

export function Card({ className, children, pad = true, solid, accent, interactive, ...rest }: { className?: string; children: ReactNode; pad?: boolean | "lg"; solid?: boolean; accent?: boolean; interactive?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("card", pad === "lg" ? "card-pad-lg" : pad && "card-pad", solid && "card-solid", accent && "card-accent", interactive && "card-interactive", className)} {...rest}>
      {children}
    </div>
  );
}

export function Badge({ tone = "neutral", mono, dot, className, children }: { tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "usdc"; mono?: boolean; dot?: boolean; className?: string; children: ReactNode }) {
  return <span className={clsx("badge", tone !== "neutral" && `badge-${tone}`, mono && "badge-mono", dot && "badge-dot", className)}>{children}</span>;
}

export function Chip({ icon, active, size, className, children, ...rest }: { icon?: IconName; active?: boolean; size?: "sm" } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={clsx("chip", size === "sm" && "chip-sm", className)} aria-pressed={active ? "true" : undefined} {...rest}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  );
}

export function Avatar({ initials, size, className }: { initials: string; size?: "sm" | "lg"; className?: string }) {
  return <span className={clsx("avatar", size && `avatar-${size}`, className)}>{initials}</span>;
}

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */

export interface FieldProps {
  label: ReactNode;
  required?: boolean;
  recommended?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  meta?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, required, recommended, hint, error, meta, htmlFor, children, className }: FieldProps) {
  return (
    <div className={clsx("field", className)}>
      <label className="field-label" htmlFor={htmlFor}>
        <span>
          {label}
          {required ? <span className="field-required"> *</span> : null}
        </span>
        {recommended ? <Badge tone="warning" mono>Recommended</Badge> : null}
        {meta ? <span className="field-meta">{meta}</span> : null}
      </label>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={clsx("input", className)} aria-invalid={invalid ? "true" : undefined} {...rest} />;
}

export function Textarea({ className, invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={clsx("textarea", className)} aria-invalid={invalid ? "true" : undefined} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx("select", className)} {...rest}>
      {children}
    </select>
  );
}

export function InputGroup({ addon, addonEnd, children }: { addon?: ReactNode; addonEnd?: ReactNode; children: ReactNode }) {
  return (
    <div className="input-group">
      {addon ? <span className="input-addon">{addon}</span> : null}
      {children}
      {addonEnd ? <span className="input-addon end">{addonEnd}</span> : null}
    </div>
  );
}

export function SearchInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={clsx("input-with-icon", className)}>
      <Icon name="search" size={15} className="icon-l" />
      <input type="search" className="input" {...rest} />
    </div>
  );
}

export function Toggle({ checked, onChange, disabled, size, label, id }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; size?: "sm"; label?: string; id?: string }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} className={clsx("toggle", size === "sm" && "toggle-sm")} disabled={disabled} onClick={() => onChange(!checked)} />
  );
}

export function Choice({ checked, onChange, children, radio, icon }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; radio?: boolean; icon?: IconName }) {
  return (
    <button type="button" role={radio ? "radio" : "checkbox"} aria-checked={checked} className={clsx("choice", radio && "radio")} onClick={() => onChange(!checked)}>
      <span className="choice-box">{checked ? <Icon name="check" size={11} strokeWidth={3} /> : null}</span>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: IconName }[] }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-pressed={o.value === value} aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon ? <Icon name={o.icon} size={13} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Accordion                                                           */
/* ------------------------------------------------------------------ */

export function Accordion({ title, icon, badge, summary, open, defaultOpen, onToggle, children, id }: { title: ReactNode; icon?: IconName; badge?: ReactNode; summary?: ReactNode; open?: boolean; defaultOpen?: boolean; onToggle?: (open: boolean) => void; children: ReactNode; id?: string }) {
  const [inner, setInner] = useState(!!defaultOpen);
  const isOpen = open ?? inner;
  const bodyId = useId();
  return (
    <section className="accordion" data-open={isOpen} id={id}>
      <button type="button" className="accordion-head" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => { setInner(!isOpen); onToggle?.(!isOpen); }}>
        {icon ? <Icon name={icon} size={16} className="accordion-icon" /> : null}
        <span className="accordion-title">
          {title}
          {badge}
        </span>
        {summary ? <span className="accordion-summary">{summary}</span> : <span className="accordion-summary" />}
        <Icon name="chevron-down" size={16} className="accordion-chevron" />
      </button>
      {isOpen ? (
        <div className="accordion-body" id={bodyId}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({ open, onClose, title, size, children, hideClose }: { open: boolean; onClose: () => void; title?: ReactNode; size?: "lg"; children: ReactNode; hideClose?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={clsx("modal", size === "lg" && "modal-lg")} role="dialog" aria-modal="true">
        {title !== undefined || !hideClose ? (
          <div className="modal-head">
            <div className="modal-title">{title}</div>
            {!hideClose ? <Button variant="ghost" icon="x" aria-label="Close" onClick={onClose} /> : null}
          </div>
        ) : null}
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline / Ring                                                    */
/* ------------------------------------------------------------------ */

export function Sparkline({ data, width = 64, height = 22, positive = true, className }: { data: number[]; width?: number; height?: number; positive?: boolean; className?: string }) {
  const d = useMemo(() => {
    if (!data.length) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const span = max - min || 1;
    const step = width / Math.max(1, data.length - 1);
    return data.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(" ");
  }, [data, width, height]);
  const color = positive ? "var(--accent-text)" : "var(--danger)";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ProgressRing({ value, size = 56, stroke = 5, label }: { value: number; size?: number; stroke?: number; label?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} style={{ transition: "stroke-dashoffset 400ms var(--ease)" }} />
      </svg>
      <span className="ring-label">{label ?? `${Math.round(pct)}`}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state / misc                                                  */
/* ------------------------------------------------------------------ */

export function EmptyState({ icon = "info", title, children, action }: { icon?: IconName; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={20} />
      </span>
      <div className="h3">{title}</div>
      {children ? <div className="small muted">{children}</div> : null}
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

interface Toast { id: number; text: string; tone?: "success" | "error" | "neutral" }
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const counter = useRef(0);
  const push = useCallback((text: string, tone: Toast["tone"] = "neutral") => {
    const id = ++counter.current;
    setItems((s) => [...s, { id, text, tone }]);
    window.setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-host" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={clsx("toast", t.tone && t.tone !== "neutral" && `toast-${t.tone}`)}>
            <Icon name={t.tone === "error" ? "alert" : t.tone === "success" ? "check" : "info"} size={15} />
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
