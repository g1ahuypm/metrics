import Link from "next/link";

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="card p-8 text-center">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">{description}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn-primary mt-4">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
