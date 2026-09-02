import { useEffect, useMemo, useRef, useState } from "react";
import type { BusinessProfile, FinancingOption, ProductOffering, Promotion, PromotionAttachment, WarrantyOption } from "@/types";
import { Accordion, Button, Card, Choice, Field, Icon, Input, InputGroup, Modal, SearchInput, Textarea } from "@/components/ui";
import { usePortal, usePortalActions } from "@/store/PortalProvider";
import { COUNTRY_NAMES, REGIONS, REGION_BY_CODE, type Region } from "@/data/regions";
import { AGENT_VOICES } from "@/data/workflows";
import { computeProgress, isFieldDone } from "@/lib/settingsProgress";
import { formatBytes, formatDate, uid } from "@/lib/format";
import { CardHead, GroupLabel, Question, StatusBadge, SubpageShell, toggleIn, useHashTarget, useSavedFlash } from "./shared";
import { FINANCING, FINANCING_LABELS, PRODUCTS, PRODUCT_LABELS, WARRANTIES, WARRANTY_LABELS, formatPhoneInput, splitZones } from "./labels";

type Section = "products" | "referrals" | "promotions" | "markets";

const money = (n: number | null) => (n === null ? "" : `$${n.toLocaleString("en-US")}`);
const numOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export function BusinessProfilePage() {
  const { settings } = usePortal();
  const { updateBusiness } = usePortalActions();
  const b = settings.business;
  const saved = useSavedFlash(b);
  const hash = useHashTarget();
  const progress = useMemo(() => computeProgress(settings).sections.business, [settings]);
  const done = (key: string) => isFieldDone(settings, "business", key);
  const identityDone = ["fullName", "preferredName", "email", "phone", "companyName"].every(done);

  const [open, setOpen] = useState<Record<Section, boolean>>({ products: false, referrals: false, promotions: false, markets: false });
  useEffect(() => {
    if (hash && hash in open) setOpen((o) => ({ ...o, [hash]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);
  const toggle = (k: Section) => (v: boolean) => setOpen((o) => ({ ...o, [k]: v }));

  const [preview, setPreview] = useState(false);

  /* ---- summaries ---- */
  const productSummary = useMemo(() => {
    if (!b.products.length && !b.financing.length && !b.warranties.length) return "Nothing selected yet";
    const names = b.products.map((p) => PRODUCT_LABELS[p]);
    const head = names.length === 0 ? "No products" : names.length <= 2 ? names.join(" + ") : `${names.slice(0, 2).join(" + ")} +${names.length - 2} more`;
    return `${head} · ${b.financing.length} financing option${b.financing.length === 1 ? "" : "s"} · ${b.warranties.length} warrant${b.warranties.length === 1 ? "y" : "ies"}`;
  }, [b.products, b.financing, b.warranties]);

  const referralSummary = b.referralBudgetMin === null || b.referralBudgetMax === null ? "Not set" : `${money(b.referralBudgetMin)} – ${money(b.referralBudgetMax)} per referral`;

  const promoSummary = useMemo(() => {
    const active = b.promotions.filter((p) => p.text.trim());
    if (!active.length) return "None yet";
    const dates = active.map((p) => p.expiresAt).filter(Boolean).sort();
    return `${active.length} active${dates[0] ? ` · expires ${formatDate(dates[0] + "T12:00:00")}` : ""}`;
  }, [b.promotions]);

  const zones = splitZones(b.targetMarkets).length;
  const marketSummary = `${b.activeMarkets.length} active market${b.activeMarkets.length === 1 ? "" : "s"} · ${zones} target zone${zones === 1 ? "" : "s"}`;

  const refError = b.referralBudgetMin !== null && b.referralBudgetMax !== null && b.referralBudgetMax < b.referralBudgetMin ? "Maximum must be at least the minimum." : null;
  const rebError = b.rebateBudgetMin !== null && b.rebateBudgetMax !== null && b.rebateBudgetMax < b.rebateBudgetMin ? "Maximum must be at least the minimum." : null;

  return (
    <SubpageShell
      section="Business Profile"
      title="Business Profile"
      description="This is what your agents know about your company. It powers every conversation they have with your leads."
      done={progress.completed}
      total={progress.total}
      saved={saved}
      action={
        <Button variant="secondary" icon="user" onClick={() => setPreview(true)}>
          Preview as customer
        </Button>
      }
    >
      {/* ---------------- Identity ---------------- */}
      <Card className="st-card" id="identity">
        <CardHead icon="user" title="Identity" badge={<StatusBadge done={identityDone} />} />
        <div className="field-grid">
          <Field label="Full name" required htmlFor="biz-fullName">
            <Input id="biz-fullName" value={b.fullName} autoComplete="name" onChange={(e) => updateBusiness({ fullName: e.target.value })} />
          </Field>
          <Field label="Preferred name" required htmlFor="biz-preferredName" hint="What your agents call you.">
            <Input id="biz-preferredName" value={b.preferredName} placeholder="e.g. Hassan" onChange={(e) => updateBusiness({ preferredName: e.target.value })} />
          </Field>
          <Field label="Email" required htmlFor="biz-email" hint="Used for agent notifications and lead replies.">
            <InputGroup addon={<Icon name="mail" size={14} />}>
              <Input id="biz-email" type="email" inputMode="email" autoComplete="email" value={b.email} onChange={(e) => updateBusiness({ email: e.target.value })} />
            </InputGroup>
          </Field>
          <Field label="Phone number" required htmlFor="biz-phone" hint="Where appointment confirmations reach you.">
            <InputGroup addon="+1">
              <Input id="biz-phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(555) 123-4567" value={b.phone} onChange={(e) => updateBusiness({ phone: formatPhoneInput(e.target.value) })} />
            </InputGroup>
          </Field>
          <Field label="Company name" required htmlFor="biz-companyName">
            <Input id="biz-companyName" value={b.companyName} autoComplete="organization" onChange={(e) => updateBusiness({ companyName: e.target.value })} />
          </Field>
          <Field label="Company website" recommended htmlFor="biz-website" hint="Recommended — agents share this with leads.">
            <InputGroup addon="https://" addonEnd={<Icon name="globe" size={14} />}>
              <Input id="biz-website" inputMode="url" placeholder="yourcompany.com" value={b.companyWebsite} onChange={(e) => updateBusiness({ companyWebsite: e.target.value.replace(/^https?:\/\//i, "") })} />
            </InputGroup>
          </Field>
          <Field label="Company bio" htmlFor="biz-bio" className="st-span-2" meta={`${b.companyBio.length}/400`} hint="Two sentences your agents can work into conversation.">
            <Textarea id="biz-bio" maxLength={400} value={b.companyBio} placeholder="Family-run installer serving the South Bay since 2016…" onChange={(e) => updateBusiness({ companyBio: e.target.value.slice(0, 400) })} />
          </Field>
        </div>
      </Card>

      {/* ---------------- Products ---------------- */}
      <Accordion id="products" icon="box" title="Products, Services & Warranties" badge={<StatusBadge done={done("products")} />} summary={productSummary} open={open.products} onToggle={toggle("products")}>
        <div className="st-group" style={{ marginTop: 14 }}>
          <GroupLabel>Products &amp; services — select all that apply</GroupLabel>
          <div className="choice-grid" role="group" aria-label="Products and services">
            {PRODUCTS.map((p) => (
              <Choice key={p} checked={b.products.includes(p)} onChange={(v) => updateBusiness({ products: toggleIn<ProductOffering>(b.products, p, v) })}>
                {PRODUCT_LABELS[p]}
              </Choice>
            ))}
          </div>
        </div>
        <div className="st-group">
          <GroupLabel>Financing options</GroupLabel>
          <div className="choice-grid" role="group" aria-label="Financing options">
            {FINANCING.map((f) => (
              <Choice key={f} checked={b.financing.includes(f)} onChange={(v) => updateBusiness({ financing: toggleIn<FinancingOption>(b.financing, f, v) })}>
                {FINANCING_LABELS[f]}
              </Choice>
            ))}
          </div>
        </div>
        <div className="st-group">
          <GroupLabel>Warranties</GroupLabel>
          <div className="choice-grid" role="group" aria-label="Warranties">
            {WARRANTIES.map((w) => (
              <Choice key={w} checked={b.warranties.includes(w)} onChange={(v) => updateBusiness({ warranties: toggleIn<WarrantyOption>(b.warranties, w, v) })}>
                {WARRANTY_LABELS[w]}
              </Choice>
            ))}
          </div>
        </div>
      </Accordion>

      {/* ---------------- Referrals ---------------- */}
      <Accordion id="referrals" icon="gift" title="Referrals & Rebates" badge={<StatusBadge done={done("referrals")} />} summary={referralSummary} open={open.referrals} onToggle={toggle("referrals")}>
        <Question>What referral/rebate budget can your sales agents offer?</Question>
        <div className="field-grid">
          <Field label="Referral bonus — Minimum" required htmlFor="biz-refMin">
            <InputGroup addon="$">
              <Input id="biz-refMin" inputMode="decimal" placeholder="250" value={b.referralBudgetMin ?? ""} onChange={(e) => updateBusiness({ referralBudgetMin: numOrNull(e.target.value) })} />
            </InputGroup>
          </Field>
          <Field label="Referral bonus — Maximum" required htmlFor="biz-refMax" error={refError}>
            <InputGroup addon="$">
              <Input id="biz-refMax" inputMode="decimal" placeholder="750" invalid={!!refError} value={b.referralBudgetMax ?? ""} onChange={(e) => updateBusiness({ referralBudgetMax: numOrNull(e.target.value) })} />
            </InputGroup>
          </Field>
          <Field label="Rebate — Minimum" htmlFor="biz-rebMin" hint="Optional.">
            <InputGroup addon="$">
              <Input id="biz-rebMin" inputMode="decimal" placeholder="0" value={b.rebateBudgetMin ?? ""} onChange={(e) => updateBusiness({ rebateBudgetMin: numOrNull(e.target.value) })} />
            </InputGroup>
          </Field>
          <Field label="Rebate — Maximum" htmlFor="biz-rebMax" error={rebError} hint="Optional.">
            <InputGroup addon="$">
              <Input id="biz-rebMax" inputMode="decimal" placeholder="0" invalid={!!rebError} value={b.rebateBudgetMax ?? ""} onChange={(e) => updateBusiness({ rebateBudgetMax: numOrNull(e.target.value) })} />
            </InputGroup>
          </Field>
        </div>
      </Accordion>

      {/* ---------------- Promotions ---------------- */}
      <Accordion id="promotions" icon="megaphone" title="Active Promotions" badge={<StatusBadge done={done("promotions")} />} summary={promoSummary} open={open.promotions} onToggle={toggle("promotions")}>
        <Question>What can your agents offer/promote right now?</Question>
        <Promotions promotions={b.promotions} onChange={(promotions) => updateBusiness({ promotions })} />
      </Accordion>

      {/* ---------------- Markets ---------------- */}
      <Accordion id="markets" icon="globe" title="Markets" badge={<StatusBadge done={done("markets")} />} summary={marketSummary} open={open.markets} onToggle={toggle("markets")}>
        <Question>Active markets — select all that apply</Question>
        <MarketPicker value={b.activeMarkets} onChange={(activeMarkets) => updateBusiness({ activeMarkets })} />
        <div style={{ marginTop: 22 }}>
          <Field label="Target markets — list all cities / zip codes / utility zones that apply" htmlFor="biz-target" meta={`${zones} zone${zones === 1 ? "" : "s"}`}>
            <Textarea id="biz-target" placeholder="e.g. Naperville, 60540, ComEd territory" value={b.targetMarkets} onChange={(e) => updateBusiness({ targetMarkets: e.target.value })} />
          </Field>
        </div>
      </Accordion>

      <PreviewModal open={preview} onClose={() => setPreview(false)} b={b} agentName={agentDisplayName(settings.agent.voice, settings.agent.customName)} />
    </SubpageShell>
  );
}

function agentDisplayName(voice: string | null, customName: string): string {
  if (!voice) return "Jarvis";
  if (voice === "custom") return customName.trim() || "Jarvis";
  return AGENT_VOICES.find((v) => v.id === voice)?.name ?? "Jarvis";
}

/* ------------------------------------------------------------------ */
/* Promotions editor                                                   */
/* ------------------------------------------------------------------ */

function Promotions({ promotions, onChange }: { promotions: Promotion[]; onChange: (p: Promotion[]) => void }) {
  const patch = (id: string, p: Partial<Promotion>) => onChange(promotions.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const add = () => onChange([...promotions, { id: uid("promo"), text: "", expiresAt: "", attachments: [] }]);
  return (
    <div className="st-promos">
      {promotions.length === 0 ? <p className="st-note">No promotions yet. Add one so your agents have something to lead with.</p> : null}
      {promotions.map((p, i) => (
        <PromotionRow key={p.id} index={i} promo={p} onPatch={(x) => patch(p.id, x)} onDelete={() => onChange(promotions.filter((x) => x.id !== p.id))} />
      ))}
      <div className="st-actions" style={{ marginTop: promotions.length ? 4 : 8 }}>
        <Button variant="outline" size="sm" icon="plus" onClick={add}>
          Add promotion
        </Button>
      </div>
    </div>
  );
}

function PromotionRow({ index, promo, onPatch, onDelete }: { index: number; promo: Promotion; onPatch: (p: Partial<Promotion>) => void; onDelete: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const textId = `promo-text-${promo.id}`;
  const dateId = `promo-date-${promo.id}`;
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next: PromotionAttachment[] = Array.from(files).map((f) => ({ id: uid("att"), name: f.name, sizeBytes: f.size, type: f.type || "application/octet-stream" }));
    onPatch({ attachments: [...promo.attachments, ...next] });
  };
  return (
    <div className="st-promo">
      <Field label={`Promotion ${index + 1}`} htmlFor={textId}>
        <Textarea id={textId} rows={3} style={{ minHeight: 84 }} placeholder="e.g. $500 off battery storage when bundled with a new PV system through October" value={promo.text} onChange={(e) => onPatch({ text: e.target.value })} />
      </Field>
      <div className="st-promo-side">
        <Field label="Expiration date" htmlFor={dateId} hint="Optional.">
          <Input id={dateId} type="date" value={promo.expiresAt} onChange={(e) => onPatch({ expiresAt: e.target.value })} />
        </Field>
      </div>
      <div className="st-promo-foot">
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} aria-label="Attach files to promotion" />
        <Button variant="ghost" size="sm" icon="paperclip" onClick={() => fileRef.current?.click()}>
          Attach
        </Button>
        {promo.attachments.map((a) => (
          <span key={a.id} className="st-pill" title={`${a.name} · ${formatBytes(a.sizeBytes)}`}>
            <Icon name={a.type.startsWith("image/") ? "image" : "file"} size={12} />
            <span className="st-pill-name">{a.name}</span>
            <button type="button" className="st-pill-x" aria-label={`Remove ${a.name}`} onClick={() => onPatch({ attachments: promo.attachments.filter((x) => x.id !== a.id) })}>
              <Icon name="x" size={11} />
            </button>
          </span>
        ))}
        <Button variant="ghost" size="sm" icon="trash" className="st-promo-delete" aria-label={`Delete promotion ${index + 1}`} onClick={onDelete} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Markets multi-select                                                */
/* ------------------------------------------------------------------ */

const COUNTRIES: Region["country"][] = ["US", "CA", "AU", "GB"];

function MarketPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const groups = useMemo(
    () =>
      COUNTRIES.map((c) => ({
        country: c,
        name: COUNTRY_NAMES[c],
        regions: REGIONS.filter((r) => r.country === c && (!query || r.name.toLowerCase().includes(query) || r.code.toLowerCase().includes(query) || COUNTRY_NAMES[c].toLowerCase().includes(query))),
      })).filter((g) => g.regions.length),
    [query],
  );
  const selected = new Set(value);
  const setAll = (codes: string[], on: boolean) => {
    const s = new Set(value);
    codes.forEach((c) => (on ? s.add(c) : s.delete(c)));
    onChange(REGIONS.filter((r) => s.has(r.code)).map((r) => r.code));
  };

  return (
    <div>
      <div className="st-selected" aria-live="polite">
        {value.length === 0 ? <span className="st-note">No markets selected yet.</span> : null}
        {value.map((code) => (
          <span key={code} className="st-pill accent">
            <span className="st-pill-name">{REGION_BY_CODE[code]?.name ?? code}</span>
            <button type="button" className="st-pill-x" aria-label={`Remove ${REGION_BY_CODE[code]?.name ?? code}`} onClick={() => setAll([code], false)}>
              <Icon name="x" size={11} />
            </button>
          </span>
        ))}
        {value.length > 1 ? (
          <Button variant="ghost" size="sm" onClick={() => onChange([])}>
            Clear all
          </Button>
        ) : null}
      </div>
      <SearchInput placeholder="Search states, provinces, or countries…" aria-label="Search markets" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="st-market-groups">
        {groups.length === 0 ? <p className="st-market-empty">No regions match “{q}”.</p> : null}
        {groups.map((g) => {
          const codes = g.regions.map((r) => r.code);
          const all = codes.every((c) => selected.has(c));
          return (
            <div key={g.country} className="st-group">
              <GroupLabel
                end={
                  <Button variant="ghost" size="sm" onClick={() => setAll(codes, !all)}>
                    {all ? "Clear" : "Select all"}
                  </Button>
                }
              >
                {g.name}
              </GroupLabel>
              <div className="choice-grid" role="group" aria-label={g.name}>
                {g.regions.map((r) => (
                  <Choice key={r.code} checked={selected.has(r.code)} onChange={(v) => setAll([r.code], v)}>
                    {r.name}
                  </Choice>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Preview modal                                                       */
/* ------------------------------------------------------------------ */

function PreviewModal({ open, onClose, b, agentName }: { open: boolean; onClose: () => void; b: BusinessProfile; agentName: string }) {
  const company = b.companyName.trim() || "your company";
  const promo = b.promotions.find((p) => p.text.trim());
  const referral = b.referralBudgetMin !== null && b.referralBudgetMax !== null ? `${money(b.referralBudgetMin)} – ${money(b.referralBudgetMax)}` : null;
  return (
    <Modal open={open} onClose={onClose} title="How your agent introduces you">
      <div className="st-chat">
        <div className="st-bubble agent">
          <span className="st-bubble-who">{agentName} · agent</span>
          Hi, this is {agentName} with {company.replace(/\.$/, "")}. {b.companyBio.trim() ? `${b.companyBio.trim().replace(/([^.!?])$/, "$1.")} ` : ""}
          {promo ? `Right now we're offering ${promo.text.trim()}. ` : ""}
          Do you have a minute to talk about what solar could save you?
        </div>
        <div className="st-bubble lead">
          <span className="st-bubble-who">Lead</span>
          Sure — where can I learn more?
        </div>
        <div className="st-bubble agent">
          <span className="st-bubble-who">{agentName} · agent</span>
          {b.companyWebsite.trim() ? `You can see our work at https://${b.companyWebsite.trim()}. ` : "I'll text you our details. "}
          {referral ? `And if you know a neighbour who's curious, we pay ${referral} per referral.` : ""}
        </div>
      </div>
      <div className="st-preview-facts">
        <div className="st-fact">
          <div className="st-fact-k">Website</div>
          <div className="st-fact-v">{b.companyWebsite.trim() ? `https://${b.companyWebsite.trim()}` : "Not set"}</div>
        </div>
        <div className="st-fact">
          <div className="st-fact-k">Promotion</div>
          <div className="st-fact-v">{promo ? promo.text.trim() : "None yet"}</div>
        </div>
        <div className="st-fact">
          <div className="st-fact-k">Referral budget</div>
          <div className="st-fact-v">{referral ?? "Not set"}</div>
        </div>
      </div>
    </Modal>
  );
}
