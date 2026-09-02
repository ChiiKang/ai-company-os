import { useEffect, useId, useState } from "react";
import { Button, Field, Input, Modal, Segmented, Select, useToast } from "@/components/ui";
import { usePortal, usePortalActions } from "@/store/PortalProvider";
import type { PaymentMethod } from "@/types";
import { UsdcLogo } from "./parts";

type Mode = "card" | "usdc";
const NETWORKS = ["Base", "Ethereum", "Solana", "Polygon"] as const;
type Network = (typeof NETWORKS)[number];

function detectBrand(number: string): PaymentMethod["brand"] {
  if (/^3[47]/.test(number)) return "amex";
  if (/^5[1-5]|^2[2-7]/.test(number)) return "mastercard";
  return "visa";
}

function groupDigits(digits: string, amex: boolean): string {
  return amex ? digits.replace(/(\d{4})(\d{0,6})(\d{0,5})/, (_, a, b, c) => [a, b, c].filter(Boolean).join(" ")) : (digits.match(/.{1,4}/g) ?? []).join(" ");
}

export function PaymentMethodModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { wallet } = usePortal();
  const { updateWallet } = usePortalActions();
  const toast = useToast();
  const ids = { name: useId(), number: useId(), exp: useId(), cvc: useId(), addr: useId(), net: useId() };

  const [mode, setMode] = useState<Mode>("card");
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [addr, setAddr] = useState("");
  const [net, setNet] = useState<Network>("Base");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(wallet.paymentMethod?.brand === "usdc" ? "usdc" : "card");
    setName(""); setNumber(""); setExp(""); setCvc(""); setAddr(""); setNet("Base"); setTouched(false);
  }, [open, wallet.paymentMethod?.brand]);

  const digits = number.replace(/\D/g, "");
  const brand = detectBrand(digits);
  const amex = brand === "amex";
  const numberOk = amex ? digits.length === 15 : digits.length === 16;
  const expOk = /^(0[1-9]|1[0-2])\/\d{2}$/.test(exp);
  const cvcOk = cvc.length === (amex ? 4 : 3);
  const nameOk = name.trim().length >= 2;
  const cardOk = nameOk && numberOk && expOk && cvcOk;

  const addrTrim = addr.trim();
  const addrOk = net === "Solana" ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addrTrim) : /^0x[0-9a-fA-F]{40}$/.test(addrTrim);
  const valid = mode === "card" ? cardOk : addrOk;

  const save = () => {
    setTouched(true);
    if (!valid) return;
    const pm: PaymentMethod = mode === "card" ? { brand, last4: digits.slice(-4), label: name.trim() } : { brand: "usdc", last4: addrTrim.slice(-4), label: `${net} network` };
    updateWallet({ paymentMethod: pm });
    toast(mode === "card" ? `Card ending ${pm.last4} saved` : `USDC wallet on ${net} linked`, "success");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage payment method">
      <form className="pm-form" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        <Segmented<Mode> value={mode} onChange={setMode} options={[{ value: "card", label: "Card", icon: "card" }, { value: "usdc", label: "USDC wallet", icon: "coins" }]} />

        {mode === "card" ? (
          <div className="pm-fields">
            <Field label="Name on card" htmlFor={ids.name} error={touched && !nameOk ? "Enter the cardholder's name" : undefined}>
              <Input id={ids.name} autoComplete="cc-name" placeholder="Hassan Hewaidi" value={name} onChange={(e) => setName(e.target.value)} invalid={touched && !nameOk} />
            </Field>
            <Field label="Card number" htmlFor={ids.number} meta={digits.length ? brand.toUpperCase() : undefined} error={touched && !numberOk ? `Enter a ${amex ? 15 : 16}-digit card number` : undefined}>
              <Input id={ids.number} inputMode="numeric" autoComplete="cc-number" placeholder={amex ? "3782 822463 10005" : "4242 4242 4242 4242"} value={groupDigits(digits, amex)} onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, amex ? 15 : 16))} invalid={touched && !numberOk} className="mono" />
            </Field>
            <div className="pm-two">
              <Field label="Expiry" htmlFor={ids.exp} error={touched && !expOk ? "MM/YY" : undefined}>
                <Input id={ids.exp} inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={exp} onChange={(e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 4); setExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d); }} invalid={touched && !expOk} className="mono" />
              </Field>
              <Field label="CVC" htmlFor={ids.cvc} error={touched && !cvcOk ? `${amex ? 4 : 3} digits` : undefined}>
                <Input id={ids.cvc} type="password" inputMode="numeric" autoComplete="cc-csc" placeholder={amex ? "••••" : "•••"} value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, amex ? 4 : 3))} invalid={touched && !cvcOk} className="mono" />
              </Field>
            </div>
            <p className="small faint">Card payments carry a 2.9% + $0.30 processing fee. Switch to USDC to pay 0%.</p>
          </div>
        ) : (
          <div className="pm-fields">
            <div className="usdc-note">
              <UsdcLogo size={18} />
              <span>Funds settle instantly, <strong>0% processing fee</strong>. Your USDC balance also powers Advanced mode.</span>
            </div>
            <Field label="Network" htmlFor={ids.net}>
              <Select id={ids.net} value={net} onChange={(e) => setNet(e.target.value as Network)}>
                {NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            <Field label="Wallet address" htmlFor={ids.addr} hint={net === "Solana" ? "Base58 address" : "0x… address (40 hex characters)"} error={touched && !addrOk ? `Enter a valid ${net} address` : undefined}>
              <Input id={ids.addr} autoComplete="off" spellCheck={false} placeholder={net === "Solana" ? "7xKX…" : "0x…"} value={addr} onChange={(e) => setAddr(e.target.value)} invalid={touched && !addrOk} className="mono" />
            </Field>
          </div>
        )}

        <div className="buy-foot">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={mode === "usdc" ? "usdc" : "primary"} icon={mode === "usdc" ? "coins" : "card"}>
            {mode === "usdc" ? "Link wallet" : "Save card"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
