import { AlertTriangle, Bell, CheckCircle2, Clock, MessageSquare, PlusCircle, RotateCcw, UserRound, XCircle } from "lucide-react";
import { requireSignedIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettingsRow } from "@/lib/integrations/config";
import { validTimezone } from "@/lib/scope";
import { fmtDateTime } from "@/lib/format";
import { pushPublicKey } from "@/lib/push";
import { markAllReadAction } from "@/lib/actions/inbox";
import { PageHeader } from "@/components/PageHeader";
import { NotificationsCard } from "./NotificationsCard";

const ICON: Record<string, { icon: typeof Bell; tone: string }> = {
  assigned: { icon: PlusCircle, tone: "bg-accent-soft text-accent" },
  due_tomorrow: { icon: Clock, tone: "bg-surface-2 text-ink-2" },
  due_today: { icon: Clock, tone: "bg-warn/15 text-warn-text" },
  overdue: { icon: AlertTriangle, tone: "bg-bad/10 text-bad-text" },
  overdue_copy: { icon: AlertTriangle, tone: "bg-bad/10 text-bad-text" },
  comment: { icon: MessageSquare, tone: "bg-accent-soft text-accent" },
  done: { icon: CheckCircle2, tone: "bg-good/15 text-good-text" },
  extension_requested: { icon: Clock, tone: "bg-warn/15 text-warn-text" },
  extension_approved: { icon: CheckCircle2, tone: "bg-good/15 text-good-text" },
  extension_declined: { icon: XCircle, tone: "bg-bad/10 text-bad-text" },
  reassigned: { icon: UserRound, tone: "bg-surface-2 text-ink-2" },
  reopened: { icon: RotateCcw, tone: "bg-accent-soft text-accent" },
};

function ago(d: Date, now: Date, tz: string): string {
  const min = Math.round((now.getTime() - d.getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  return fmtDateTime(d, tz);
}

export default async function InboxPage() {
  const me = await requireSignedIn();
  const [items, settings, publicKey, devices] = await Promise.all([
    db.notification.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 150 }),
    getSettingsRow(),
    pushPublicKey(),
    db.pushSubscription.findMany({ where: { userId: me.id }, orderBy: { createdAt: "asc" }, select: { device: true } }),
  ]);
  const tz = validTimezone(me.timeZone ?? settings.timezone);
  const now = new Date();
  const unread = items.filter((n) => !n.readAt);
  const earlier = items.filter((n) => n.readAt);

  const row = (n: (typeof items)[number]) => {
    const { icon: Icon, tone } = ICON[n.kind] ?? { icon: Bell, tone: "bg-surface-2 text-ink-2" };
    return (
      // A plain link: Next's <Link> would prefetch it, and visiting it marks the item read.
      <a key={n.id} href={`/inbox/go/${n.id}`} className="flex gap-3 px-4 py-3 hover:bg-surface-2">
        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${tone}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className={`text-sm ${n.readAt ? "text-ink-2" : "font-semibold"}`}>{n.title}</span>
            <span className="shrink-0 text-xs text-ink-3">{ago(n.createdAt, now, tz)}</span>
          </span>
          {n.body && <span className="mt-0.5 line-clamp-2 block text-sm text-ink-2">{n.body}</span>}
        </span>
        {!n.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
      </a>
    );
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Inbox" description="Your task notifications: new tasks, reminders, updates and answers.">
        {unread.length > 0 && (
          <form action={markAllReadAction}>
            <button type="submit" className="btn-secondary">Mark all as read</button>
          </form>
        )}
      </PageHeader>

      <NotificationsCard publicKey={publicKey} devices={devices.map((d) => d.device ?? "Device")} />

      {unread.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-ink-3">New · {unread.length}</h2>
          <div className="card divide-y divide-border overflow-hidden">{unread.map(row)}</div>
        </section>
      )}
      <section className="mt-5">
        {unread.length > 0 && earlier.length > 0 && <h2 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Earlier</h2>}
        {earlier.length > 0 && <div className="card divide-y divide-border overflow-hidden">{earlier.map(row)}</div>}
        {items.length === 0 && (
          <div className="card px-4 py-10 text-center text-sm text-ink-3">Nothing here yet. New tasks, reminders and updates will show up here.</div>
        )}
      </section>
    </div>
  );
}
