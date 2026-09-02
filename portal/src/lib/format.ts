export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", opts);
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatMoney(n: number, currency: "USD" | "USDC" = "USD"): string {
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Math.abs(n));
  const signed = n < 0 ? `-${s}` : s;
  return currency === "USDC" ? `${signed.replace("$", "")} USDC` : signed;
}

export function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return e164;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toLowerCase() ?? "")
    .join("");
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function fullName(l: { firstName: string; lastName: string }): string {
  return `${l.firstName} ${l.lastName}`.trim();
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
