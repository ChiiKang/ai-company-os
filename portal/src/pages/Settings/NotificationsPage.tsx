import { useEffect, useMemo, useRef, useState } from "react";
import type { AppointmentType, CalendarProvider, DayHours, NotificationChannel, VideoProvider, Weekday } from "@/types";
import { Avatar, Badge, Button, Card, Choice, Icon, Input, Modal, Toggle } from "@/components/ui";
import { usePortal, usePortalActions } from "@/store/PortalProvider";
import { TIMEZONES } from "@/data/regions";
import { computeProgress, isFieldDone } from "@/lib/settingsProgress";
import { clsx } from "@/lib/format";
import { CardHead, StatusBadge, SubpageShell, toggleIn, useHashTarget, useSavedFlash } from "./shared";
import { APPOINTMENT_LABELS, APPOINTMENT_TYPES, CALENDAR_PROVIDERS, CHANNEL_LABELS, VIDEO_PROVIDERS, WEEKDAYS, timezoneOffset } from "./labels";

const DEFAULT_HOURS: DayHours = { enabled: true, open: "08:00", close: "20:00" };
const ALL_TYPES: AppointmentType[] = ["in_person", "video_call", "voice_call", "customer_preference"];

export function NotificationsPage() {
  const { settings, user } = usePortal();
  const { updateNotifications } = usePortalActions();
  const n = settings.notifications;
  const saved = useSavedFlash(n);
  useHashTarget();
  const progress = useMemo(() => computeProgress(settings).sections.notifications, [settings]);
  const done = (k: string) => isFieldDone(settings, "notifications", k);

  /* ---- appointment types ---- */
  const setType = (t: AppointmentType, on: boolean) => {
    if (t === "customer_preference") return updateNotifications({ appointmentTypes: on ? [...ALL_TYPES] : [] });
    let next = toggleIn<AppointmentType>(n.appointmentTypes, t, on);
    const allBase = (["in_person", "video_call", "voice_call"] as AppointmentType[]).every((x) => next.includes(x));
    next = toggleIn<AppointmentType>(next, "customer_preference", allBase);
    updateNotifications({ appointmentTypes: next });
  };

  /* ---- hours ---- */
  const setDay = (d: Weekday, p: Partial<DayHours>) => updateNotifications({ businessHours: { ...n.businessHours, [d]: { ...n.businessHours[d], ...p } } });
  const applyMonday = () => {
    const mon = n.businessHours.mon;
    updateNotifications({ businessHours: Object.fromEntries(WEEKDAYS.map((w) => [w.key, { ...mon }])) as Record<Weekday, DayHours> });
  };
  const resetHours = () => updateNotifications({ businessHours: Object.fromEntries(WEEKDAYS.map((w) => [w.key, { ...DEFAULT_HOURS }])) as Record<Weekday, DayHours> });

  /* ---- oauth ---- */
  const [oauth, setOauth] = useState<{ kind: "calendar"; id: CalendarProvider } | { kind: "video"; id: VideoProvider } | null>(null);
  const confirmOauth = () => {
    if (!oauth) return;
    if (oauth.kind === "calendar") updateNotifications({ calendar: { provider: oauth.id, connected: true, account: user.email } });
    else updateNotifications({ video: { provider: oauth.id, connected: true, account: user.email } });
    setOauth(null);
  };
  const oauthMeta = oauth ? (oauth.kind === "calendar" ? CALENDAR_PROVIDERS : VIDEO_PROVIDERS).find((p) => p.id === oauth.id) : null;

  /* ---- device notifications ---- */
  const [perm, setPerm] = useState<NotificationPermission | "unsupported" | null>(() => {
    try {
      return typeof Notification !== "undefined" ? Notification.permission : "unsupported";
    } catch {
      return "unsupported";
    }
  });
  const setChannel = async (c: NotificationChannel, on: boolean) => {
    updateNotifications({ channels: toggleIn<NotificationChannel>(n.channels, c, on) });
    if (c === "push" && on) {
      try {
        if (typeof Notification !== "undefined" && Notification.requestPermission) {
          const r = await Notification.requestPermission();
          setPerm(r);
        } else setPerm("unsupported");
      } catch {
        setPerm("unsupported");
      }
    }
  };

  return (
    <SubpageShell section="Notifications" title="Notifications" description="When and how leads reach you — hours, calendars, and alerts." done={progress.completed} total={progress.total} saved={saved}>
      {/* ---------- Appointment type ---------- */}
      <Card className="st-card" id="appointments">
        <CardHead icon="calendar" title="Preferred appointment type" badge={<StatusBadge done={done("appointmentTypes")} />} caption="Select all that apply." />
        <div className="choice-grid" role="group" aria-label="Preferred appointment type">
          {APPOINTMENT_TYPES.map((t) => (
            <Choice key={t} checked={n.appointmentTypes.includes(t)} onChange={(v) => setType(t, v)}>
              {APPOINTMENT_LABELS[t]}
            </Choice>
          ))}
        </div>
      </Card>

      {/* ---------- Business hours ---------- */}
      <Card className="st-card" id="hours">
        <CardHead
          icon="clock"
          title="Business hours"
          caption="Default: Monday – Sunday, 8:00 AM – 8:00 PM local lead time"
          end={
            <>
              <Button variant="ghost" size="sm" onClick={applyMonday}>
                Apply Monday to all days
              </Button>
              <Button variant="ghost" size="sm" onClick={resetHours}>
                Reset to default
              </Button>
            </>
          }
        />
        <div className="st-hours">
          {WEEKDAYS.map((w) => {
            const d = n.businessHours[w.key];
            return (
              <div key={w.key} className="st-hour-row" data-off={!d.enabled}>
                <span className="st-hour-day" id={`day-${w.key}`}>{w.short}</span>
                <Toggle size="sm" checked={d.enabled} label={`${w.label} enabled`} onChange={(v) => setDay(w.key, { enabled: v })} />
                <Input type="time" aria-label={`${w.label} opens at`} value={d.open} disabled={!d.enabled} onChange={(e) => setDay(w.key, { open: e.target.value })} />
                <span className="st-hour-sep" aria-hidden="true">–</span>
                <Input type="time" aria-label={`${w.label} closes at`} value={d.close} disabled={!d.enabled} onChange={(e) => setDay(w.key, { close: e.target.value })} />
              </div>
            );
          })}
        </div>
      </Card>

      {/* ---------- Timezone ---------- */}
      <Card className="st-card" id="timezone">
        <CardHead icon="globe" title="Timezone" badge={<StatusBadge done={done("timezone")} />} caption="Business hours and lead contact windows are interpreted in this timezone." />
        <TimezoneCombo value={n.timezone} onChange={(timezone) => updateNotifications({ timezone })} />
      </Card>

      {/* ---------- Calendar ---------- */}
      <Card className="st-card" id="calendar">
        <CardHead icon="calendar" title="Calendar" badge={n.calendar?.connected ? <Badge mono tone="success">Connected</Badge> : null} caption="Connect your Calendly, Microsoft Teams, or Google Calendar so booked appointments land on your schedule." />
        <div className="st-providers">
          {CALENDAR_PROVIDERS.map((p) => {
            const connected = n.calendar?.provider === p.id && n.calendar.connected;
            return (
              <ProviderTile key={p.id} id={p.id} name={p.name} connected={connected} account={connected ? n.calendar?.account : undefined} onConnect={() => setOauth({ kind: "calendar", id: p.id })} onDisconnect={() => updateNotifications({ calendar: null })} />
            );
          })}
        </div>
      </Card>

      {/* ---------- Video ---------- */}
      <Card className="st-card" id="video">
        <CardHead icon="video" title="Video platform" badge={n.video?.connected ? <Badge mono tone="success">Connected</Badge> : null} caption="Where video appointments happen. Your agent includes the join link automatically." />
        <div className="st-providers">
          {VIDEO_PROVIDERS.map((p) => {
            const connected = n.video?.provider === p.id && n.video.connected;
            return (
              <ProviderTile key={p.id} id={p.id} name={p.name} connected={connected} account={connected ? n.video?.account : undefined} onConnect={() => setOauth({ kind: "video", id: p.id })} onDisconnect={() => updateNotifications({ video: null })} />
            );
          })}
        </div>
      </Card>

      {/* ---------- Channels ---------- */}
      <Card className="st-card" id="channels">
        <CardHead icon="bell" title="Notifications" badge={<StatusBadge done={done("channels")} />} caption="How would you like to be notified? Select all that apply." />
        <div className="choice-grid" role="group" aria-label="Notification channels">
          {(["email", "sms", "push"] as NotificationChannel[]).map((c) => (
            <Choice key={c} checked={n.channels.includes(c)} onChange={(v) => void setChannel(c, v)} icon={c === "email" ? "mail" : c === "sms" ? "message" : "bell"}>
              {CHANNEL_LABELS[c]}
              {c === "push" && n.channels.includes("push") && perm ? (
                <Badge mono className="st-perm" tone={perm === "granted" ? "success" : perm === "denied" ? "danger" : "neutral"}>
                  {perm === "unsupported" ? "Unavailable" : perm}
                </Badge>
              ) : null}
            </Choice>
          ))}
        </div>
      </Card>

      <Modal open={!!oauth} onClose={() => setOauth(null)} title={oauthMeta ? `Connect ${oauthMeta.name}` : undefined}>
        {oauthMeta ? (
          <div className="st-oauth">
            <div className="st-oauth-account">
              <Avatar initials={user.initials} />
              <div className="who">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
            </div>
            <ul className="st-oauth-scopes">
              <li>
                <Icon name="check" size={14} className="ok" /> See and create events on your calendar
              </li>
              <li>
                <Icon name="check" size={14} className="ok" /> Add meeting links to appointments your agent books
              </li>
              <li>
                <Icon name="shield" size={14} /> EnergyEngine never reads event contents
              </li>
            </ul>
            <div className="st-oauth-actions">
              <Button variant="ghost" onClick={() => setOauth(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={confirmOauth}>
                Continue with {oauthMeta.vendor}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </SubpageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Provider tile with inline brand glyphs                              */
/* ------------------------------------------------------------------ */

function Glyph({ id }: { id: CalendarProvider | VideoProvider }) {
  // Brand marks are the one place hard-coded colors are allowed.
  switch (id) {
    case "calendly":
      return (
        <svg className="st-glyph" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="9" fill="#006BFF" />
          <path d="M20.5 12.2a5.2 5.2 0 1 0 0 7.6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      );
    case "microsoft_teams":
      return (
        <svg className="st-glyph" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="9" fill="#5B5FC7" />
          <path d="M9.5 12.5h9M14 12.5v9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="22.5" cy="11" r="2.2" fill="#fff" />
        </svg>
      );
    case "google_calendar":
      return (
        <svg className="st-glyph" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="9" fill="#fff" />
          <rect x="7" y="7" width="18" height="18" rx="3" fill="none" stroke="#4285F4" strokeWidth="2.4" />
          <path d="M7 12.5h18" stroke="#EA4335" strokeWidth="2.4" />
          <text x="16" y="22" textAnchor="middle" fontSize="9" fontWeight="700" fill="#34A853" fontFamily="sans-serif">
            31
          </text>
        </svg>
      );
    case "zoom":
      return (
        <svg className="st-glyph" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="9" fill="#2D8CFF" />
          <rect x="7.5" y="11" width="12" height="10" rx="2.5" fill="#fff" />
          <path d="M20.5 14.5 25 12v8l-4.5-2.5z" fill="#fff" />
        </svg>
      );
    case "google_meet":
      return (
        <svg className="st-glyph" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="9" fill="#fff" />
          <rect x="6.5" y="10" width="13" height="12" rx="2" fill="#00832D" />
          <path d="M19.5 14.5 25.5 11v10l-6-3.5z" fill="#FBBC04" />
          <rect x="6.5" y="10" width="6.5" height="6" fill="#4285F4" />
        </svg>
      );
  }
}

function ProviderTile({ id, name, connected, account, onConnect, onDisconnect }: { id: CalendarProvider | VideoProvider; name: string; connected: boolean; account?: string; onConnect: () => void; onDisconnect: () => void }) {
  return (
    <div className="st-provider" data-connected={connected}>
      <div className="st-provider-top">
        <Glyph id={id} />
        <div style={{ minWidth: 0 }}>
          <div className="st-provider-name">{name}</div>
          <div className={clsx("st-provider-status", connected && "on")} title={account}>
            {connected ? `Connected · ${account}` : "Not connected"}
          </div>
        </div>
      </div>
      <div className="st-provider-foot">
        {connected ? (
          <>
            <Badge tone="success" dot>
              Active
            </Badge>
            <button type="button" className="st-link" onClick={onDisconnect}>
              Disconnect
            </button>
          </>
        ) : (
          <Button variant="secondary" size="sm" icon="link" onClick={onConnect}>
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Timezone combobox                                                   */
/* ------------------------------------------------------------------ */

function TimezoneCombo({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const query = q.trim().toLowerCase().replace(/\s+/g, "_");
  const items = useMemo(() => TIMEZONES.filter((tz) => !query || tz.toLowerCase().includes(query)).slice(0, 40), [query]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (tz: string) => {
    onChange(tz);
    setOpen(false);
    setQ("");
  };
  const offset = timezoneOffset(value);

  return (
    <div>
      <div className="st-combo">
        <div className="input-with-icon">
          <Icon name="search" size={15} className="icon-l" />
          <input
            className="input"
            role="combobox"
            aria-label="Timezone"
            aria-expanded={open}
            aria-controls="tz-list"
            aria-autocomplete="list"
            aria-activedescendant={open && items[active] ? `tz-${items[active]}` : undefined}
            placeholder="Search timezones… e.g. Chicago"
            value={open ? q : value.replace(/_/g, " ")}
            onFocus={() => {
              setOpen(true);
              setQ("");
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter" && open && items[active]) {
                e.preventDefault();
                choose(items[active]);
              } else if (e.key === "Escape") {
                setOpen(false);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </div>
        {open ? (
          <ul className="st-combo-list" id="tz-list" role="listbox" ref={listRef}>
            {items.length === 0 ? <li className="st-combo-empty">No timezone matches “{q}”.</li> : null}
            {items.map((tz, i) => (
              <li key={tz} id={`tz-${tz}`} role="option" aria-selected={i === active} data-current={tz === value} className="st-combo-item" onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(tz)}>
                <span>{tz.replace(/_/g, " ")}</span>
                <span className="off">{timezoneOffset(tz)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="st-tz-current">
        <Icon name="clock" size={14} />
        <span>
          Current: <strong>{value.replace(/_/g, " ")}</strong>
          {offset ? <span className="mono faint"> · {offset}</span> : null}
        </span>
      </div>
    </div>
  );
}
