import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ActivityEvent, Lead, StatRange, StatSeries } from "@/types";
import { usePortal, usePortalActions } from "@/store/PortalProvider";
import { Badge, Card, Icon, Input, Segmented, Sparkline } from "@/components/ui";
import { STATUS_TONE, statusLabel } from "@/components/chat/ChatCards";
import { formatNumber, formatPhone, fullName, timeAgo } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Animated counter                                                    */
/* ------------------------------------------------------------------ */

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Counts from 0 to `target` in ~500ms whenever `target` (or `key`) changes. */
function useCountUp(target: number, key: string, duration = 500): number {
  const [value, setValue] = useState(target);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    setValue(0);
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [target, key, duration]);
  return value;
}

/* ------------------------------------------------------------------ */
/* Stat tile                                                           */
/* ------------------------------------------------------------------ */

function StatTile({ stat, range }: { stat: StatSeries; range: StatRange }) {
  const value = useCountUp(stat.value, range);
  const positive = stat.deltaPct >= 0;
  return (
    <div className="stat-tile" role="listitem">
      <span className="stat-label">{stat.label}</span>
      <div className="stat-row">
        <span className="stat-value" aria-label={`${stat.label}: ${formatNumber(stat.value)}`}>
          {formatNumber(value)}
        </span>
        <span className={positive ? "stat-delta up" : "stat-delta down"} title="vs previous period">
          <Icon name={positive ? "trending-up" : "trending-down"} size={11} strokeWidth={2.2} />
          {positive ? "+" : ""}
          {stat.deltaPct}%
        </span>
      </div>
      <Sparkline data={stat.series} positive={positive} width={72} height={24} className="stat-spark" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Performance dashboard                                               */
/* ------------------------------------------------------------------ */

export function PerformanceDashboard() {
  const { getStats } = usePortalActions();
  const [range, setRange] = useState<StatRange>("today");
  const [from, setFrom] = useState("2026-08-01");
  const [to, setTo] = useState("2026-09-01");
  const stats = getStats(range);

  return (
    <section className="dash-section" aria-labelledby="dash-perf">
      <div className="dash-head">
        <h2 id="dash-perf" className="eyebrow">
          Performance dashboard
        </h2>
      </div>
      <div className="dash-range">
        <Segmented<StatRange>
          value={range}
          onChange={setRange}
          options={[
            { value: "today", label: "Today", icon: "clock" },
            { value: "all", label: "All Time", icon: "globe" },
            { value: "custom", label: "Custom Date", icon: "calendar" },
          ]}
        />
        {range === "custom" ? (
          <div className="dash-dates fade-up">
            <label className="dash-date">
              <span className="tiny faint">From</span>
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            </label>
            <label className="dash-date">
              <span className="tiny faint">To</span>
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
            </label>
          </div>
        ) : null}
      </div>
      <div className="stat-grid" role="list" aria-label="Performance stats">
        {stats.map((s) => (
          <StatTile key={s.key} stat={s} range={range} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Recent activity                                                     */
/* ------------------------------------------------------------------ */

export function RecentActivity({ limit = 5 }: { limit?: number }) {
  const { activity } = usePortal();
  const navigate = useNavigate();
  const items = activity.slice(0, limit);
  return (
    <Card className="dash-activity" pad={false}>
      <div className="dash-activity-head">
        <h2 className="eyebrow">Recent activity</h2>
        <button type="button" className="dash-link" onClick={() => navigate("/activity")}>
          View all
          <Icon name="plus" size={12} strokeWidth={2.2} />
        </button>
      </div>
      <ul className="activity-list">
        {items.map((ev) => (
          <ActivityRow key={ev.id} event={ev} onOpen={ev.leadId ? () => navigate(`/activity/${ev.leadId}`) : undefined} />
        ))}
        {!items.length ? <li className="activity-empty small faint">No activity yet. Start a workflow to see it here.</li> : null}
      </ul>
    </Card>
  );
}

function ActivityRow({ event, onOpen }: { event: ActivityEvent; onOpen?: () => void }) {
  const body = (
    <>
      <span className="activity-dot" aria-hidden="true" />
      <span className="activity-main">
        <span className="activity-title-row">
          <span className="activity-title">{event.title}</span>
          <span className="activity-time mono">{timeAgo(event.at)}</span>
        </span>
        {event.lines.slice(0, 2).map((l, i) => (
          <span key={i} className="activity-line">
            {l}
          </span>
        ))}
      </span>
    </>
  );
  return (
    <li className="activity-item">
      {onOpen ? (
        <button type="button" className="activity-btn" onClick={onOpen}>
          {body}
        </button>
      ) : (
        <div className="activity-btn is-static">{body}</div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Lead card (when a lead is in context)                               */
/* ------------------------------------------------------------------ */

export function LeadContextCard({ lead }: { lead: Lead }) {
  const navigate = useNavigate();
  return (
    <Card className="dash-lead" accent>
      <div className="dash-lead-head">
        <span className="eyebrow">Lead</span>
        <Badge tone={STATUS_TONE[lead.status]} dot className="dash-lead-status">
          {statusLabel(lead.status)}
        </Badge>
      </div>
      <div className="dash-lead-name h2">{fullName(lead)}</div>
      <dl className="dash-lead-meta">
        <div>
          <dt>
            <Icon name="phone" size={12} />
          </dt>
          <dd>{formatPhone(lead.phone)}</dd>
        </div>
        <div>
          <dt>
            <Icon name="map-pin" size={12} />
          </dt>
          <dd>
            {lead.address}, {lead.city} {lead.state}, {lead.zip}
          </dd>
        </div>
        <div>
          <dt>
            <Icon name="zap" size={12} />
          </dt>
          <dd>
            {lead.workflows.length} workflow{lead.workflows.length === 1 ? "" : "s"}
            {lead.workflows[0] ? <span className="faint"> · latest: {lead.workflows[0].label}</span> : null}
          </dd>
        </div>
      </dl>
      <button type="button" className="dash-link" onClick={() => navigate(`/activity/${lead.id}`)}>
        Activity feed
        <Icon name="arrow-up-right" size={12} />
      </button>
    </Card>
  );
}
