import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { IconName } from "@/types";
import { Badge, Icon } from "@/components/ui";
import { clsx } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

/** Flashes "Saved" whenever the watched store slice changes after mount. */
export function useSavedFlash(slice: unknown): boolean {
  const prev = useRef(slice);
  const [on, setOn] = useState(false);
  useEffect(() => {
    // Compare by identity so StrictMode's double-mount never counts as a change.
    if (prev.current === slice) return;
    prev.current = slice;
    setOn(true);
    const t = window.setTimeout(() => setOn(false), 1800);
    return () => window.clearTimeout(t);
  }, [slice]);
  return on;
}

/** Returns the current location hash (without "#") and scrolls the target into view on mount / hash change. */
export function useHashTarget(): string {
  const { hash } = useLocation();
  const id = hash.replace(/^#/, "");
  useEffect(() => {
    if (!id) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [id]);
  return id;
}

export function toggleIn<T>(list: T[], item: T, on: boolean): T[] {
  const without = list.filter((x) => x !== item);
  return on ? [...without, item] : without;
}

/* ------------------------------------------------------------------ */
/* Sub-page shell                                                      */
/* ------------------------------------------------------------------ */

export function SubpageShell({ section, title, description, done, total, saved, action, children }: { section: string; title: string; description: string; done: number; total: number; saved: boolean; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="page st-page fade-up">
      <header className="st-sub-head">
        <nav className="st-crumb" aria-label="Breadcrumb">
          <Link to="/settings" className="st-crumb-link">
            <Icon name="chevron-left" size={15} />
            Settings
          </Link>
          <span className="st-crumb-sep" aria-hidden="true">/</span>
          <span className="st-crumb-current" aria-current="page">{section}</span>
          <span className={clsx("st-saved", saved && "on")} role="status" aria-live="polite">
            <Icon name="check" size={13} strokeWidth={2.5} />
            {saved ? "Saved" : ""}
          </span>
        </nav>
        <Badge mono tone={done >= total ? "success" : "neutral"}>
          {done} of {total} complete
        </Badge>
      </header>
      <div className="st-title-row">
        <div className="st-title-block">
          <h1 className="h-serif st-title">{title}</h1>
          <p className="muted st-desc">{description}</p>
        </div>
        {action ? <div className="st-title-action">{action}</div> : null}
      </div>
      <div className="st-sections">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card heading + status badge                                         */
/* ------------------------------------------------------------------ */

export function StatusBadge({ done, required = true }: { done: boolean; required?: boolean }) {
  if (done) return <Badge mono tone="success">Complete</Badge>;
  if (!required) return null;
  return <Badge mono tone="warning">Required</Badge>;
}

export function CardHead({ icon, title, step, badge, caption, end }: { icon: IconName; title: ReactNode; step?: number; badge?: ReactNode; caption?: ReactNode; end?: ReactNode }) {
  return (
    <div className="st-card-head">
      <div className="st-card-head-row">
        <span className="st-card-icon" aria-hidden="true">
          <Icon name={icon} size={16} />
        </span>
        {step ? <span className="st-step mono">{String(step).padStart(2, "0")}</span> : null}
        <h2 className="st-card-title">{title}</h2>
        {badge}
        {end ? <div className="st-card-head-end">{end}</div> : null}
      </div>
      {caption ? <p className="st-card-caption">{caption}</p> : null}
    </div>
  );
}

export function Question({ children }: { children: ReactNode }) {
  return <p className="st-question">{children}</p>;
}

export function GroupLabel({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className="st-group-label">
      <span>{children}</span>
      {end}
    </div>
  );
}
