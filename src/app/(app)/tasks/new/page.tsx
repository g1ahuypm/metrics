import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { canManageTasks, requireSignedIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { validTimezone } from "@/lib/scope";
import { firstStoreTimezone, getStoreScope } from "@/lib/stores";
import { storeDate, toISODate } from "@/lib/dates";
import { TaskForm } from "../TaskClient";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const me = await requireSignedIn();
  if (!canManageTasks(me.role)) redirect("/tasks");
  const sp = await searchParams;
  const [members] = await Promise.all([
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, timeZone: true } }),
  ]);
  const tz = validTimezone(me.timeZone ?? (await firstStoreTimezone()));
  const scope = await getStoreScope(me);
  const today = storeDate(new Date(), tz);
  const tomorrow = toISODate(addDays(new Date(`${today}T00:00:00Z`), 1));

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/tasks" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Tasks
      </Link>
      <h1 className="mb-1 text-[28px] font-extrabold tracking-tight">New task</h1>
      <p className="mb-5 text-sm text-ink-2">The person gets a notification right away, then reminders the day before, on the day, and every morning while it&apos;s late.</p>
      <div className="card p-4 sm:p-6">
        <TaskForm
          members={members}
          today={today}
          myTimeZone={tz}
          stores={scope.stores.map((s) => ({ id: s.id, name: s.name }))}
          values={{ title: "", details: "", doneMeans: "", assigneeId: members.some((m) => m.id === sp.for) ? sp.for! : "", dueDate: tomorrow, dueTime: "", priority: "normal", link: "", storeId: scope.store?.id ?? "" }}
        />
      </div>
    </div>
  );
}
