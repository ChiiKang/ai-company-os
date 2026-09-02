import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { IconName } from "@/types";
import { Button, Card, Icon, ProgressRing, useToast } from "@/components/ui";
import { usePortal, usePortalActions } from "@/store/PortalProvider";
import { computeProgress, type SectionProgress, type SettingsSection } from "@/lib/settingsProgress";
import { clsx } from "@/lib/format";

const TILES: { key: SettingsSection; to: string; icon: IconName; title: string; description: string; unit: string }[] = [
  { key: "business", to: "/settings/business", icon: "briefcase", title: "Business Profile", description: "Who you are, what you sell, and what your agents can promise.", unit: "fields" },
  { key: "notifications", to: "/settings/notifications", icon: "bell", title: "Notifications", description: "When and how leads reach you — hours, calendars, and alerts.", unit: "groups" },
  { key: "agent", to: "/settings/agent", icon: "bot", title: "Agent Profile", description: "Choose your agent's voice, language, and training.", unit: "steps" },
];

function TileState({ s }: { s: SectionProgress }) {
  if (s.state === "complete") return <span className="state-success">✓ Complete</span>;
  if (s.state === "not_started") return <span className="state-muted">● Not started</span>;
  const n = s.requiredMissing.length;
  return <span className="state-warning">● {n} required</span>;
}

export function SettingsHub() {
  const { settings } = usePortal();
  const { resetDemo } = usePortalActions();
  const toast = useToast();
  const progress = useMemo(() => computeProgress(settings), [settings]);
  const left = progress.requiredMissing.length;
  const live = left === 0;
  const next = progress.requiredMissing.slice(0, 2);

  return (
    <div className="page st-hub fade-up">
      <header className="st-hub-head">
        <div>
          <div className="eyebrow">Account</div>
          <h1 className="h-serif st-hub-title">Settings</h1>
          <p className="muted st-hub-desc">Set up your business, your notifications, and your agent — most owners finish in under five minutes.</p>
        </div>
        <div className="st-progress" aria-label={`Setup ${progress.percent} percent complete`}>
          <ProgressRing value={progress.percent} size={60} stroke={5} label={`${progress.percent}%`} />
          <div className="st-progress-text">
            <strong>Setup {progress.percent}% complete</strong>
            <span>{live ? "You're live" : `${left} required ${left === 1 ? "field" : "fields"} left`}</span>
          </div>
        </div>
      </header>

      <div className="st-tiles">
        {TILES.map((t) => {
          const s = progress.sections[t.key];
          return (
            <Link key={t.key} to={t.to} className="st-tile-link" aria-label={`${t.title}: ${s.completed} of ${s.total} complete`}>
              <Card interactive className="st-tile">
                <span className="st-tile-icon">
                  <Icon name={t.icon} size={19} />
                </span>
                <Icon name="arrow-up-right" size={18} className="st-tile-arrow" />
                <div>
                  <h2 className="st-tile-title">{t.title}</h2>
                  <p className="st-tile-desc">{t.description}</p>
                </div>
                <div className="st-tile-meta">
                  <span>
                    {s.total} {t.unit}
                  </span>
                  <span className="dot">·</span>
                  <TileState s={s} />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <section className={clsx("st-banner", live && "live")} aria-live="polite">
        <span className="st-banner-icon">
          <Icon name={live ? "check" : "sparkle"} size={18} />
        </span>
        <div className="st-banner-text">
          <strong>{live ? "You're live." : "Finish setting up"}</strong>
          <span>{live ? "Your agents have everything they need." : `You're ${left} ${left === 1 ? "field" : "fields"} away from going live.`}</span>
        </div>
        {!live ? (
          <div className="st-banner-links">
            {next.map((m) => (
              <Link key={`${m.section}-${m.field}`} to={m.path}>
                {m.label} <Icon name="arrow-right" size={13} />
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <div className="st-hub-foot">
        <Button
          variant="ghost"
          size="sm"
          icon="refresh"
          onClick={() => {
            resetDemo();
            toast("Demo data reset to defaults", "success");
          }}
        >
          Reset demo data
        </Button>
      </div>
    </div>
  );
}
