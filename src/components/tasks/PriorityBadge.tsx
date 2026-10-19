/** Only High and Urgent get a badge; Normal is the quiet default. */
export function PriorityBadge({ priority, always = false }: { priority: string; always?: boolean }) {
  if (priority === "urgent") return <span className="badge border-bad/40 bg-bad/10 text-bad-text">Urgent</span>;
  if (priority === "high") return <span className="badge border-warn/50 bg-warn/10 text-warn-text">High</span>;
  return always ? <span className="badge">Normal</span> : null;
}
