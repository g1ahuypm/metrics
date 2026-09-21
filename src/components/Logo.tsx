export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold text-ink">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-accent-ink text-xs font-bold">P</span>
      {!compact && <span>ProfitDeck</span>}
    </span>
  );
}
