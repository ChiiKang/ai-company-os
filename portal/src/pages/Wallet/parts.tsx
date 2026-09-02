import type { ReactNode } from "react";
import type { PaymentMethod } from "@/types";
import { clsx } from "@/lib/format";

/** USDC mark: blue disc with a dollar glyph, drawn inline so it renders identically in both themes. */
export function UsdcLogo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={clsx("usdc-logo", className)} aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="var(--usdc)" />
      <path d="M20.5 18.6c0-2.3-1.4-3.1-4.2-3.5-2-.3-2.4-.8-2.4-1.7s.7-1.5 2-1.5c1.2 0 1.9.4 2.2 1.4.1.2.2.3.4.3h1.1c.2 0 .4-.2.4-.4v-.1c-.3-1.5-1.5-2.6-3-2.9V8.7c0-.2-.2-.4-.5-.5h-1c-.2 0-.4.2-.5.5v1.5c-2 .3-3.3 1.6-3.3 3.3 0 2.2 1.3 3 4.1 3.4 1.9.3 2.5.7 2.5 1.8s-.9 1.7-2.1 1.7c-1.6 0-2.2-.7-2.4-1.6-.1-.2-.2-.4-.5-.4h-1.1c-.2 0-.4.2-.4.4v.1c.3 1.7 1.4 2.9 3.6 3.2v1.5c0 .2.2.4.5.5h1c.2 0 .4-.2.5-.5v-1.5c2-.4 3.3-1.8 3.3-3.7Z" fill="#fff" />
      <path d="M12.6 25.5c-5.2-1.9-7.9-7.7-6-12.9 1-2.8 3.2-4.9 6-5.9.2-.1.4-.3.4-.6v-.9c0-.2-.1-.4-.3-.5h-.3C6 6.7 2.6 13.4 4.7 19.8c1.2 3.8 4.1 6.7 7.9 7.9.2.1.5 0 .6-.3v-1.3c0-.2-.2-.5-.6-.6Zm7.1-20.7c-.2-.1-.5 0-.6.3v1.3c0 .3.2.5.5.6 5.2 1.9 7.9 7.7 6 12.9-1 2.8-3.2 4.9-6 5.9-.2.1-.4.3-.4.6v.9c0 .2.1.4.3.5h.3c6.4-2 9.8-8.7 7.7-15.1-1.2-3.8-4.2-6.7-7.8-7.9Z" fill="#fff" opacity=".9" />
    </svg>
  );
}

const BRAND_LABEL: Record<PaymentMethod["brand"], string> = { visa: "VISA", mastercard: "MC", amex: "AMEX", usdc: "USDC" };

/** Small card-network pill (VISA / MC / AMEX / USDC). Brand colours are marks, so they are the one place hardcoding is allowed. */
export function BrandPill({ brand, className }: { brand: PaymentMethod["brand"]; className?: string }) {
  return (
    <span className={clsx("brand-pill", `brand-${brand}`, className)} aria-label={brand === "usdc" ? "USDC wallet" : `${BRAND_LABEL[brand]} card`}>
      {brand === "usdc" ? <UsdcLogo size={12} /> : null}
      {BRAND_LABEL[brand]}
    </span>
  );
}

export function PaymentMethodLine({ method, fallback = "No payment method" }: { method: PaymentMethod | null; fallback?: ReactNode }) {
  if (!method) return <span className="muted">{fallback}</span>;
  return (
    <span className="pm-line">
      <BrandPill brand={method.brand} />
      <span className="pm-digits">•••• {method.last4}</span>
      {method.label ? <span className="pm-label faint">{method.label}</span> : null}
    </span>
  );
}

/** Currency pill used in the transaction list. */
export function CurrencyPill({ currency }: { currency: "USD" | "USDC" }) {
  return <span className={clsx("cur-pill", currency === "USDC" && "cur-usdc")}>{currency === "USDC" ? <UsdcLogo size={11} /> : null}{currency}</span>;
}

/** Card processing fee used across the wallet (Stripe-style 2.9% + $0.30). */
export const CARD_FEE_PCT = 0.029;
export const CARD_FEE_FIXED = 0.3;
export function cardFee(amount: number): number {
  return amount > 0 ? +(amount * CARD_FEE_PCT + CARD_FEE_FIXED).toFixed(2) : 0;
}
