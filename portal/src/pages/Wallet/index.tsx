import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Accordion, Badge, Button, Icon, Modal, Toggle, useToast } from "@/components/ui";
import { Logo } from "@/components/shell/Logo";
import { usePortal, usePortalActions } from "@/store/PortalProvider";
import type { Currency } from "@/types";
import { clsx, formatDate, formatMoney } from "@/lib/format";
import { BuyCreditsModal } from "./BuyCreditsModal";
import { PaymentMethodModal } from "./PaymentMethodModal";
import { AutoReloadModal } from "./AutoReloadModal";
import { CancelPlanModal } from "./CancelPlanModal";
import { CurrencyPill, PaymentMethodLine, UsdcLogo } from "./parts";
import "./wallet.css";

type Sub = null | "payment" | "reload" | "cancel" | { buy: Currency | undefined };

const UNLOCKS = [
  "Book paid lead lists & data enrichment on demand",
  "Pay per-call for premium telephony & verification APIs",
  "Settle referral bonuses to customers instantly",
];

export function WalletPage() {
  const navigate = useNavigate();
  const { wallet } = usePortal();
  const { updateWallet } = usePortalActions();
  const toast = useToast();
  const [sub, setSub] = useState<Sub>(null);

  const closeSub = useCallback(() => setSub(null), []);
  const close = useCallback(() => {
    // A nested modal owns Escape / backdrop while it is open.
    if (sub !== null) return;
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  }, [navigate, sub]);

  const setAdvanced = (on: boolean) => {
    updateWallet({ advancedMode: on });
    if (on) toast("Advanced mode on — fund your agent wallet with USDC to unlock agentic tools", "success");
    else toast("Advanced mode off", "neutral");
  };

  const planName = wallet.plan.charAt(0).toUpperCase() + wallet.plan.slice(1);
  const renews = formatDate(wallet.renewsAt, { month: "long", day: "numeric", year: "numeric" });
  const reload = wallet.autoReload;

  return (
    <>
      <div className="wallet-ghost" aria-hidden="true">
        <Logo size={56} />
        <span className="wallet-ghost-title">Agent Command Center</span>
      </div>

      <Modal open onClose={close} title="Wallet" size="lg">
        <div className="wallet">
          {/* 1 · Plan */}
          <section className="wplan" aria-label="Plan">
            <span className="wplan-icon"><Icon name="shield" size={22} /></span>
            <div className="wplan-main">
              <div className="wplan-name">{planName}</div>
              <p className="wplan-sub muted">Your subscription will auto renew on {renews}</p>
            </div>
            <Badge tone="accent" mono>{wallet.plan}</Badge>
          </section>

          <hr className="divider" />

          {/* 2 · Payment method */}
          <div className="wrow">
            <div className="wrow-label">Payment method</div>
            <div className="wrow-value"><PaymentMethodLine method={wallet.paymentMethod} /></div>
            <div className="wrow-action"><Button variant="primary" onClick={() => setSub("payment")}>{wallet.paymentMethod ? "Manage" : "Add"}</Button></div>
          </div>

          <hr className="divider" />

          {/* 3 · Usage credits */}
          <div className="wrow wrow-credits">
            <div className="wrow-label">
              Usage credits
              <span className="info-tip" tabIndex={0} role="img" aria-label="Credits pay for calls, texts, emails and lead scans" title="Credits pay for calls, texts, emails and lead scans">
                <Icon name="info" size={14} />
              </span>
            </div>
            <div className="wrow-value">
              <div className="credits-amount">{formatMoney(wallet.creditsUsd)}</div>
              <div className="credits-caption faint">Available credits</div>
            </div>
            <div className="wrow-action"><Button variant="primary" icon="plus" onClick={() => setSub({ buy: undefined })}>Buy credits</Button></div>
          </div>

          <hr className="divider" />

          {/* 4 · Advanced mode */}
          <div className="wrow">
            <div className="wrow-label"><label htmlFor="wallet-advanced">Advanced mode</label></div>
            <div className="wrow-value muted">Pay for open agentic commerce tools</div>
            <div className="wrow-action"><Toggle id="wallet-advanced" checked={wallet.advancedMode} onChange={setAdvanced} label="Advanced mode" /></div>
          </div>

          {wallet.advancedMode ? (
            <section className="agent-wallet fade-up" aria-label="Agent wallet">
              <div className="agent-wallet-head">
                <UsdcLogo size={34} />
                <div className="agent-wallet-main">
                  <div className="agent-wallet-eyebrow eyebrow">Agent wallet</div>
                  <div className="agent-wallet-bal">{formatMoney(wallet.usdcBalance, "USDC")}</div>
                  <div className="small faint">USDC balance</div>
                </div>
                <Button variant="usdc" icon="coins" onClick={() => setSub({ buy: "USDC" })}>Fund with USDC</Button>
              </div>
              <ul className="agent-wallet-list">
                {UNLOCKS.map((t) => (
                  <li key={t}><span className="aw-check"><Icon name="check" size={11} strokeWidth={3} /></span>{t}</li>
                ))}
              </ul>
              {wallet.usdcBalance <= 0 ? <p className="agent-wallet-hint small">Your agent wallet is empty. Fund it with USDC to start using agentic tools — 0% fees, instant settlement.</p> : null}
            </section>
          ) : null}

          <hr className="divider" />

          {/* 5 · Auto-reload */}
          <div className="wrow">
            <div className="wrow-label">
              Auto-reload
              {reload.enabled ? <Badge tone="success" dot className="wrow-badge">On · reload {formatMoney(reload.amountUsd).replace(".00", "")} at {formatMoney(reload.thresholdUsd).replace(".00", "")}</Badge> : null}
            </div>
            <div className="wrow-value muted">Automatically buy credits when your prepaid balance runs low</div>
            <div className="wrow-action"><Button variant={reload.enabled ? "secondary" : "primary"} onClick={() => setSub("reload")}>{reload.enabled ? "Manage" : "Turn on"}</Button></div>
          </div>

          <hr className="divider" />

          {/* 6 · Cancellation */}
          <div className="wrow">
            <div className="wrow-label">Cancellation</div>
            <div className="wrow-value muted">Cancel plan</div>
            <div className="wrow-action"><Button variant="danger" onClick={() => setSub("cancel")}>Cancel</Button></div>
          </div>

          {/* 7 · Transactions */}
          <Accordion title="Recent transactions" icon="clock" summary={`${wallet.transactions.length} in the last 30 days`} id="wallet-transactions">
            {wallet.transactions.length ? (
              <ul className="tx-list">
                {wallet.transactions.map((t) => (
                  <li key={t.id} className="tx">
                    <span className="tx-date mono">{formatDate(t.at)}</span>
                    <span className="tx-desc truncate" title={t.description}>{t.description}</span>
                    <span className={clsx("tx-amt mono", t.amount > 0 && "is-credit")}>{t.amount > 0 ? "+" : ""}{formatMoney(t.amount, t.currency === "USDC" ? "USDC" : "USD").replace(" USDC", "")}</span>
                    <CurrencyPill currency={t.currency} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small faint">No transactions yet.</p>
            )}
          </Accordion>
        </div>
      </Modal>

      <PaymentMethodModal open={sub === "payment"} onClose={closeSub} />
      <AutoReloadModal open={sub === "reload"} onClose={closeSub} />
      <CancelPlanModal open={sub === "cancel"} onClose={closeSub} />
      <BuyCreditsModal open={typeof sub === "object" && sub !== null} onClose={closeSub} preselect={typeof sub === "object" && sub !== null ? sub.buy : undefined} />
    </>
  );
}
