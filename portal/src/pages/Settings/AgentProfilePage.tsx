import { useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { AgentLanguage, AgentVoiceId, IconName, TrainingAsset } from "@/types";
import { Badge, Button, Card, Choice, Field, Icon, Input, InputGroup, Textarea, useToast } from "@/components/ui";
import { usePortal, usePortalActions } from "@/store/PortalProvider";
import { AGENT_VOICES } from "@/data/workflows";
import { computeProgress, isFieldDone } from "@/lib/settingsProgress";
import { formatBytes, uid } from "@/lib/format";
import { CardHead, StatusBadge, SubpageShell, toggleIn, useHashTarget, useSavedFlash } from "./shared";
import { LANGUAGE_LABELS, formatPhoneInput } from "./labels";

const KIND_ICON: Record<TrainingAsset["kind"], IconName> = { script: "book", photo: "image", video: "video", document: "file", other: "paperclip" };

function classify(f: File): TrainingAsset["kind"] {
  const name = f.name.toLowerCase();
  const ext = name.split(".").pop() ?? "";
  if (f.type.startsWith("image/")) return "photo";
  if (f.type.startsWith("video/")) return "video";
  if (name.includes("script") || ["txt", "md", "rtf"].includes(ext)) return "script";
  if (["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv"].includes(ext) || f.type === "application/pdf") return "document";
  return "other";
}

export function AgentProfilePage() {
  const { settings } = usePortal();
  const { updateAgent } = usePortalActions();
  const a = settings.agent;
  const saved = useSavedFlash(a);
  useHashTarget();
  const toast = useToast();
  const progress = useMemo(() => computeProgress(settings).sections.agent, [settings]);
  const done = (k: string) => isFieldDone(settings, "agent", k);

  /* ---- test call ---- */
  const [calling, setCalling] = useState(false);
  const [queued, setQueued] = useState(false);
  const callMe = () => {
    setCalling(true);
    window.setTimeout(() => {
      setCalling(false);
      setQueued(true);
      toast(`Calling +1 ${a.testPhone}… your agent will introduce itself`, "success");
    }, 1500);
  };

  /* ---- preview voice ---- */
  const [playing, setPlaying] = useState<AgentVoiceId | null>(null);
  const preview = (id: AgentVoiceId) => {
    setPlaying(id);
    window.setTimeout(() => setPlaying((p) => (p === id ? null : p)), 2000);
  };

  /* ---- training ---- */
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next: TrainingAsset[] = Array.from(files).map((f) => ({ id: uid("asset"), name: f.name, kind: classify(f), sizeBytes: f.size, addedAt: new Date().toISOString() }));
    updateAgent({ training: [...a.training, ...next] });
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <SubpageShell section="Agent Profile" title="Agent Profile" description="Choose your agent's voice, language, and training." done={progress.completed} total={progress.total} saved={saved}>
      {/* ---------- Step 1: test ---------- */}
      <Card className="st-card" id="test">
        <CardHead icon="phone" step={1} title="Test my agent" badge={<StatusBadge done={done("testPhone")} />} caption="Hear your agent live. It will call this number and introduce itself the way it would to a lead." />
        <div className="st-call">
          <Field label="Your phone number" required htmlFor="agent-phone">
            <InputGroup addon="+1">
              <Input id="agent-phone" type="tel" inputMode="tel" placeholder="(555) 123-4567" value={a.testPhone} onChange={(e) => updateAgent({ testPhone: formatPhoneInput(e.target.value) })} />
            </InputGroup>
          </Field>
          <Button variant="primary" icon="phone" loading={calling} disabled={!done("testPhone")} onClick={callMe}>
            Call me now
          </Button>
        </div>
        {queued ? (
          <div className="st-call-ok" role="status">
            <Icon name="check" size={14} strokeWidth={2.5} /> Test call queued
          </div>
        ) : null}
      </Card>

      {/* ---------- Step 2: company ---------- */}
      <Card className="st-card" id="company">
        <CardHead icon="briefcase" step={2} title="Company name" caption="How your agent introduces the business on calls and in messages." />
        <div className="field-grid">
          <Field label="Company name" htmlFor="agent-company" hint="Defaults to your Business Profile company name">
            <Input id="agent-company" value={a.companyName} placeholder={settings.business.companyName || "Your company"} onChange={(e) => updateAgent({ companyName: e.target.value })} />
          </Field>
        </div>
      </Card>

      {/* ---------- Step 3: language ---------- */}
      <Card className="st-card" id="language">
        <CardHead icon="message" step={3} title="Agent language" badge={<StatusBadge done={done("languages")} />} caption="Select all that apply. Your agent switches to match the lead." />
        <div className="choice-grid" role="group" aria-label="Agent languages">
          {(["en", "es"] as AgentLanguage[]).map((l) => (
            <Choice key={l} checked={a.languages.includes(l)} onChange={(v) => updateAgent({ languages: toggleIn<AgentLanguage>(a.languages, l, v) })}>
              {LANGUAGE_LABELS[l]}
            </Choice>
          ))}
        </div>
      </Card>

      {/* ---------- Step 4: voice ---------- */}
      <Card className="st-card" id="voice">
        <CardHead icon="mic" step={4} title="Agent selection" badge={<StatusBadge done={done("voice")} />} caption="Pick the voice your leads will hear. Preview each one before you decide." />
        <div className="st-voices" role="radiogroup" aria-label="Agent voice">
          {AGENT_VOICES.map((v) => {
            const checked = a.voice === v.id;
            const isPlaying = playing === v.id;
            const select = () => updateAgent({ voice: v.id });
            const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                select();
              }
            };
            return (
              <div key={v.id} className="st-voice" role="radio" aria-checked={checked} tabIndex={0} onClick={select} onKeyDown={onKey}>
                <span className="st-voice-check" aria-hidden="true">
                  {checked ? <Icon name="check" size={11} strokeWidth={3} /> : null}
                </span>
                <span className="st-voice-avatar" aria-hidden="true">
                  {v.id === "custom" ? <Icon name="sparkle" size={18} /> : v.name[0]}
                </span>
                <div className="st-voice-name">
                  {v.name}
                  <Badge mono tone={checked ? "accent" : "neutral"}>{v.trait}</Badge>
                </div>
                <p className="st-voice-desc">{v.description}</p>
                {v.id !== "custom" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="st-voice-preview"
                    aria-pressed={isPlaying}
                    onClick={(e) => {
                      e.stopPropagation();
                      preview(v.id);
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {isPlaying ? (
                      <span className="st-bars" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : (
                      <Icon name="play" size={14} />
                    )}
                    {isPlaying ? "Playing…" : "Preview voice"}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
        {a.voice === "custom" ? (
          <div className="st-custom field-grid">
            <Field label="Agent name" required htmlFor="agent-customName" hint="What your agent calls itself.">
              <Input id="agent-customName" placeholder="e.g. Sunny" value={a.customName} onChange={(e) => updateAgent({ customName: e.target.value })} />
            </Field>
            <Field label="Describe the voice and tone" htmlFor="agent-customDesc" className="st-span-2">
              <Textarea id="agent-customDesc" placeholder="Warm, confident, a little playful. Never pushy. Sounds like a neighbour who happens to know solar." value={a.customVoiceDescription} onChange={(e) => updateAgent({ customVoiceDescription: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </Card>

      {/* ---------- Training ---------- */}
      <Card className="st-card" id="training">
        <CardHead icon="upload" title="Agent training" caption="Upload scripts, photos, videos, and arrangements to train your agents." />
        <input ref={fileRef} type="file" multiple hidden aria-label="Upload training files" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <div
          className="st-drop"
          role="button"
          tabIndex={0}
          data-over={over}
          aria-label="Upload training files"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <span className="st-drop-icon">
            <Icon name="upload" size={18} />
          </span>
          <strong>Drop files here, or click to browse</strong>
          <span>Call scripts, product photos, walkthrough videos, financing arrangements</span>
        </div>
        {a.training.length ? (
          <ul className="st-assets">
            {a.training.map((t) => (
              <li key={t.id} className="st-asset">
                <span className="st-asset-icon">
                  <Icon name={KIND_ICON[t.kind]} size={15} />
                </span>
                <span className="st-asset-name" title={t.name}>
                  {t.name}
                </span>
                <span className="st-asset-meta">
                  {t.kind} · {formatBytes(t.sizeBytes)}
                </span>
                <Button variant="ghost" size="sm" icon="x" aria-label={`Remove ${t.name}`} onClick={() => updateAgent({ training: a.training.filter((x) => x.id !== t.id) })} />
              </li>
            ))}
          </ul>
        ) : null}
        <div style={{ marginTop: 18 }}>
          <Field label="Training notes" htmlFor="agent-notes" hint="Objection handling, pricing rules, do-not-say list.">
            <Textarea id="agent-notes" placeholder={"Never quote a price before the roof survey.\nIf they mention a competitor, ask what they were quoted.\nDon't say “guaranteed savings”."} value={a.trainingNotes} onChange={(e) => updateAgent({ trainingNotes: e.target.value })} />
          </Field>
        </div>
      </Card>
    </SubpageShell>
  );
}
