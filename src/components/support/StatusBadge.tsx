const LABELS: Record<string, { label: string; tone: string }> = {
  new: { label: "Checking…", tone: "text-ink-3" },
  needs_reply: { label: "Needs reply", tone: "text-warn-text" },
  needs_action: { label: "Replied · to do", tone: "text-accent" },
  auto_replied: { label: "AI replied", tone: "text-good-text" },
  replied: { label: "Replied", tone: "text-good-text" },
  done: { label: "Done", tone: "text-ink-3" },
};

export function StatusBadge({ status, category }: { status: string; category: string }) {
  if (category === "other") return <span className="badge text-ink-3">Not a customer</span>;
  const s = LABELS[status] ?? LABELS.new;
  return (
    <span className={`badge ${s.tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
