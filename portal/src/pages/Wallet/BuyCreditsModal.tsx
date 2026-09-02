import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Badge, Button, Icon, InputGroup, Input, Modal, useToast } from "@/components/ui";
import { usePortal, usePortalActions } from "@/store/PortalProvider";
import type { Currency } from "@/types";
import { clsx, formatMoney } from "@/lib/format";
import { BrandPill, UsdcLogo, cardFee } from "./parts";

const PRESETS = [50, 100, 250, 500] as const;
const POPULAR = 100;
const MIN = 10;
const MAX = 10000;

type Step = "amount" | "review" | "paying" | "done";

export function BuyCreditsModal({ open, onClose, preselect }: { open: boolean; onClose: () => void; preselect?: Currency }) {
  const { wallet } = usePortal();
  const { addCredits, updateWallet } = usePortalActions();
  const toast = useToast();

  const [step, setStep] = useState<Step>("amount");
  const [preset, setPreset] = useState<number>(POPULAR);
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState<Currency>("USD");
  const customId = useId();
  const timers = useRef<number[]>([]);

  const hasCard = !!wallet.paymentMethod && wallet.paymentMethod.brand !== "usdc";

  // Reset on every open so the flow always starts clean.
  useEffect(() => {
    if (!open) return;
    setStep("amount");
    setPreset(POPULAR);
    setCustom("");
    setMethod(preselect ?? (wallet.advancedMode || !hasCard ? "USDC" : "USD"));
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselect]);

  const customValue = custom.trim() === "" ? null : Number(custom);
  const customValid = customValue !== null && Number.isFinite(customValue) && customValue >= MIN && customValue <= MAX;
  const customError = customValue !== null && !customValid ? `Enter an amount between ${formatMoney(MIN)} and ${formatMoney(MAX)}` : null;
  const amount = customValue !== null ? (customValid ? +customValue.toFixed(2) : 0) : preset;

  const fee = method === "USD" ? cardFee(amount) : 0;
  const total = +(amount + fee).toFixed(2);
  const canContinue = amount > 0 && (method === "USDC" || hasCard);

  const pay = () => {
    setStep("paying");
    const t1 = window.setTimeout(() => {
      if (method === "USDC") {
        addCredits(amount, "USDC", "USDC deposit · agent wallet");
        if (!wallet.advancedMode) updateWallet({ advancedMode: true });
        toast(`Added ${formatMoney(amount, "USDC")} to your agent wallet`, "success");
      } else {
        addCredits(amount, "USD", `Usage credits · ${wallet.paymentMethod?.brand.toUpperCase() ?? "Card"} •••• ${wallet.paymentMethod?.last4 ?? ""}`);
        toast(`Added ${formatMoney(amount)} in credits`, "success");
      }
      setStep("done");
      const t2 = window.setTimeout(onClose, 1500);
      timers.current.push(t2);
    }, 1200);
    timers.current.push(t1);
  };

  const title = step === "amount" ? "Buy credits" : step === "review" ? "Review purchase" : step === "paying" ? "Processing" : "Payment complete";
  const guardedClose = step === "paying" ? () => {} : onClose;

  return (
    <Modal open={open} onClose={guardedClose} title={title} hideClose={step === "paying" || step === "done"}>
      {step === "amount" ? (
        <div className="buy">
          <StepBar step={1} />
          <h3 className="buy-h">Choose an amount</h3>
          <div className="amt-grid" role="radiogroup" aria-label="Credit amount">
            {PRESETS.map((v) => {
              const active = customValue === null && preset === v;
              return (
                <button key={v} type="button" role="radio" aria-checked={active} className={clsx("amt-tile", active && "is-active")} onClick={() => { setPreset(v); setCustom(""); }}>
                  <span className="amt-value">{formatMoney(v).replace(".00", "")}</span>
                  {v === POPULAR ? <Badge tone="accent" mono className="amt-badge">Popular</Badge> : null}
                </button>
              );
            })}
          </div>
          <div className="amt-custom">
            <label htmlFor={customId} className="field-label">Custom amount</label>
            <InputGroup addon="$">
              <Input id={customId} inputMode="decimal" placeholder="e.g. 175" value={custom} invalid={!!customError} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ""))} aria-describedby={customError ? `${customId}-err` : undefined} />
            </InputGroup>
            {customError ? <span id={`${customId}-err`} className="field-error">{customError}</span> : <span className="field-hint">Min {formatMoney(MIN).replace(".00", "")} · Max {formatMoney(MAX).replace(".00", "")}</span>}
          </div>

          <h3 className="buy-h">Pay with</h3>
          <div className="pay-grid" role="radiogroup" aria-label="Payment method">
            <button type="button" role="radio" aria-checked={method === "USDC"} className={clsx("pay-opt pay-usdc", method === "USDC" && "is-active")} onClick={() => setMethod("USDC")}>
              <span className="pay-opt-top">
                <UsdcLogo size={28} />
                <span className="pay-opt-name">USDC</span>
                <Badge tone="usdc" mono className="pay-opt-badge">Recommended · unlocks agentic tools</Badge>
              </span>
              <span className="pay-opt-sub">0% fees · instant settlement · enables Advanced mode automatically</span>
              <span className="pay-check" aria-hidden="true"><Icon name="check" size={12} strokeWidth={3} /></span>
            </button>
            <button type="button" role="radio" aria-checked={method === "USD"} aria-disabled={!hasCard} className={clsx("pay-opt pay-card", method === "USD" && "is-active", !hasCard && "is-disabled")} onClick={() => hasCard && setMethod("USD")}>
              <span className="pay-opt-top">
                {hasCard && wallet.paymentMethod ? <BrandPill brand={wallet.paymentMethod.brand} /> : <span className="pay-card-icon"><Icon name="card" size={16} /></span>}
                <span className="pay-opt-name">{hasCard ? `Card •••• ${wallet.paymentMethod?.last4}` : "Card"}</span>
              </span>
              <span className="pay-opt-sub">{hasCard ? "2.9% + $0.30 processing" : "No card on file — add one under Payment method"}</span>
              <span className="pay-check" aria-hidden="true"><Icon name="check" size={12} strokeWidth={3} /></span>
            </button>
          </div>

          <div className="buy-foot">
            <span className="buy-foot-total">
              <span className="faint small">Total</span>
              <strong>{formatMoney(total)}</strong>
              {method === "USD" && fee > 0 ? <span className="faint small">incl. {formatMoney(fee)} fee</span> : <span className="usdc-text small">no fees</span>}
            </span>
            <Button variant={method === "USDC" ? "usdc" : "primary"} iconRight="arrow-right" disabled={!canContinue} onClick={() => setStep("review")}>
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="buy">
          <StepBar step={2} />
          <h3 className="buy-h">Order summary</h3>
          <dl className="summary">
            <div className="summary-row"><dt>Credits</dt><dd>{method === "USDC" ? formatMoney(amount, "USDC") : formatMoney(amount)}</dd></div>
            <div className="summary-row"><dt>Processing fee</dt><dd>{fee > 0 ? formatMoney(fee) : <span className="usdc-text">$0.00</span>}</dd></div>
            <div className="summary-row"><dt>Payment method</dt><dd>{method === "USDC" ? <span className="row gap-2"><UsdcLogo size={16} /> USDC wallet</span> : `${wallet.paymentMethod?.brand.toUpperCase()} •••• ${wallet.paymentMethod?.last4}`}</dd></div>
            <div className="summary-row summary-total"><dt>Total</dt><dd>{formatMoney(total)}</dd></div>
          </dl>
          {method === "USDC" ? (
            <div className="usdc-note">
              <UsdcLogo size={18} />
              <span>
                You'll receive <strong>{formatMoney(amount, "USDC")}</strong> in your agent wallet. {wallet.advancedMode ? "Advanced mode stays on." : "Advanced mode will be turned on."}
              </span>
            </div>
          ) : (
            <p className="small faint">Credits are added to your prepaid balance immediately and never expire.</p>
          )}
          <div className="buy-foot">
            <Button variant="ghost" icon="arrow-left" onClick={() => setStep("amount")}>Back</Button>
            <Button variant={method === "USDC" ? "usdc" : "primary"} onClick={pay}>Pay {formatMoney(total)}</Button>
          </div>
        </div>
      ) : null}

      {step === "paying" ? (
        <div className="buy-state" role="status" aria-live="polite">
          <span className="buy-state-icon"><Icon name="loader" size={22} className="spinner" /></span>
          <div className="h3">{method === "USDC" ? "Settling on-chain…" : "Charging your card…"}</div>
          <p className="small muted">{method === "USDC" ? "USDC settles in seconds." : "This usually takes a moment."}</p>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="buy-state" role="status" aria-live="polite">
          <span className="buy-state-icon is-success"><Icon name="check" size={24} strokeWidth={2.5} /></span>
          <div className="h3">{method === "USDC" ? `${formatMoney(amount, "USDC")} added` : `${formatMoney(amount)} added`}</div>
          <p className="small muted">{method === "USDC" ? "Your agent wallet is funded and Advanced mode is on." : "Your prepaid balance is topped up."}</p>
        </div>
      ) : null}
    </Modal>
  );
}

function StepBar({ step }: { step: 1 | 2 }) {
  const items = useMemo(() => ["Amount", "Review"], []);
  return (
    <ol className="steps" aria-label="Purchase steps">
      {items.map((label, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "current" : "todo";
        return (
          <li key={label} className={clsx("step", `step-${state}`)} aria-current={state === "current" ? "step" : undefined}>
            <span className="step-dot">{state === "done" ? <Icon name="check" size={10} strokeWidth={3} /> : n}</span>
            <span className="step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
