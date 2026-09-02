import { useEffect, useId, useState } from "react";
import { Button, Field, Modal, Select, Toggle, useToast } from "@/components/ui";
import { usePortal, usePortalActions } from "@/store/PortalProvider";
import { formatMoney } from "@/lib/format";

const THRESHOLDS = [25, 50, 100] as const;
const AMOUNTS = [50, 100, 250, 500] as const;

export function AutoReloadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wallet } = usePortal();
  const { updateWallet } = usePortalActions();
  const toast = useToast();
  const ids = { th: useId(), amt: useId(), on: useId() };

  const [enabled, setEnabled] = useState(wallet.autoReload.enabled);
  const [threshold, setThreshold] = useState<number>(wallet.autoReload.thresholdUsd);
  const [amount, setAmount] = useState<number>(wallet.autoReload.amountUsd);

  useEffect(() => {
    if (!open) return;
    // Opening from "Turn on" pre-enables so a single Save switches it on.
    setEnabled(true);
    setThreshold(wallet.autoReload.thresholdUsd);
    setAmount(wallet.autoReload.amountUsd);
  }, [open, wallet.autoReload]);

  const save = () => {
    updateWallet({ autoReload: { enabled, thresholdUsd: threshold, amountUsd: amount } });
    toast(enabled ? `Auto-reload on — ${formatMoney(amount).replace(".00", "")} whenever you drop below ${formatMoney(threshold).replace(".00", "")}` : "Auto-reload turned off", "success");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Auto-reload">
      <form className="pm-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="reload-toggle">
          <div>
            <label htmlFor={ids.on} className="h3">Automatically reload credits</label>
            <p className="small muted">We'll charge your payment method so your agents never pause mid-workflow.</p>
          </div>
          <Toggle id={ids.on} checked={enabled} onChange={setEnabled} label="Enable auto-reload" />
        </div>
        <div className="pm-two">
          <Field label="When balance drops below" htmlFor={ids.th}>
            <Select id={ids.th} value={threshold} disabled={!enabled} onChange={(e) => setThreshold(Number(e.target.value))}>
              {THRESHOLDS.map((v) => <option key={v} value={v}>{formatMoney(v).replace(".00", "")}</option>)}
            </Select>
          </Field>
          <Field label="Reload amount" htmlFor={ids.amt}>
            <Select id={ids.amt} value={amount} disabled={!enabled} onChange={(e) => setAmount(Number(e.target.value))}>
              {AMOUNTS.map((v) => <option key={v} value={v}>{formatMoney(v).replace(".00", "")}</option>)}
            </Select>
          </Field>
        </div>
        <p className="small faint">
          {enabled ? <>Reload {formatMoney(amount).replace(".00", "")} at {formatMoney(threshold).replace(".00", "")} using {wallet.paymentMethod ? (wallet.paymentMethod.brand === "usdc" ? "your USDC wallet" : `card •••• ${wallet.paymentMethod.last4}`) : "your payment method"}.</> : "Auto-reload is off. Your agents pause when credits run out."}
        </p>
        <div className="buy-foot">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
