/**
 * EnergyEngine.ai brand mark — the eight-bar pinwheel from the 2026 brand kit.
 * Paths are traced from the kit's vector artwork; the two upper-right bars are Blue Ocean.
 *
 * tone="brand" (default): bars follow the text colour, blue bars stay Blue Ocean.
 * tone="mono": every bar uses currentColor (for tinted/ghosted uses).
 */
const BARS: Array<[boolean, string]> = [
  [false, "M20.57 58.93 L5.36 32.58 L11.42 29.08 L26.63 55.43 L20.57 58.93 Z"],
  [false, "M88.58 70.92 L73.37 44.57 L79.43 41.07 L94.64 67.42 L88.58 70.92 Z"],
  [false, "M35.50 77.12 L6.11 69.25 L7.93 62.49 L37.31 70.36 L35.50 77.12 Z"],
  [true, "M92.07 37.51 L62.69 29.64 L64.50 22.88 L93.89 30.75 L92.07 37.51 Z"],
  [false, "M32.58 94.64 L29.08 88.58 L55.43 73.37 L58.93 79.43 L32.58 94.64 Z"],
  [true, "M44.57 26.63 L41.07 20.57 L67.42 5.36 L70.92 11.42 L44.57 26.63 Z"],
  [false, "M69.25 93.89 L62.49 92.07 L70.36 62.69 L77.12 64.50 L69.25 93.89 Z"],
  [false, "M29.64 37.31 L22.88 35.50 L30.75 6.11 L37.51 7.93 L29.64 37.31 Z"],
];

export function Logo({ size = 28, className, tone = "brand" }: { size?: number; className?: string; tone?: "brand" | "mono" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      {BARS.map(([blue, d], i) => (
        <path key={i} d={d} fill={tone === "mono" ? "currentColor" : blue ? "var(--brand-blue)" : "var(--text)"} />
      ))}
    </svg>
  );
}

export function Wordmark({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <Logo size={size} />
      <span className="wordmark">
        Energy<em>Engine</em><small>.ai</small>
      </span>
    </span>
  );
}
