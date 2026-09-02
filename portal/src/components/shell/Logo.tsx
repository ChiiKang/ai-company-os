/** EnergyEngine mark: eight-spoke burst with a bolt. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <g stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" opacity="0.9">
        <path d="M32 8v9" /><path d="M32 47v9" /><path d="M8 32h9" /><path d="M47 32h9" />
        <path d="M15 15l6.5 6.5" /><path d="M42.5 42.5 49 49" /><path d="M49 15l-6.5 6.5" /><path d="M21.5 42.5 15 49" />
      </g>
      <path d="M36 18 23 36h9l-3 12 13-18h-9z" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <Logo size={26} />
      <span className="menu-brand-name">
        Energy<em>Engine</em>.ai
      </span>
    </span>
  );
}
