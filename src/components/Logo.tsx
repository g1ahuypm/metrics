/** The Margin mark: the part of each sale you keep, inside the whole. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <rect width="48" height="48" rx="13" fill="#6D4AFF" />
      <rect x="10" y="10" width="28" height="28" rx="7" fill="none" stroke="#fff" strokeWidth="3" />
      <rect x="22" y="22" width="12" height="12" rx="3.5" fill="#fff" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-ink">
      <LogoMark />
      {!compact && <span className="text-[21px] font-extrabold tracking-tight">Margin</span>}
    </span>
  );
}
