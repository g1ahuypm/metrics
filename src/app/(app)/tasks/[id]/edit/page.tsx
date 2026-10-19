import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canManageTasks, requireSignedIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettingsRow } from "@/lib/integrations/config";
import { validTimezone } from "@/lib/scope";
import { storeDate } from "@/lib/dates";
import { DeleteTaskButton, TaskForm } from "../../TaskClient";

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireSignedIn();
  const { id } = await params;
  if (!canManageTasks(me.role)) redirect(`/tasks/${id}`);
  const [task, members, settings] = await Promise.all([
    db.task.findUnique({ where: { id } }),
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, timeZone: true } }),
    getSettingsRow(),
  ]);
  if (!task) notFound();
  const tz = validTimezone(me.timeZone ?? settings.timezone);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/tasks/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to the task
      </Link>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Edit task</h1>
        <DeleteTaskButton taskId={id} />
      </div>
      <div className="card p-4 sm:p-6">
        <TaskForm
          members={members}
          today={storeDate(new Date(), tz)}
          myTimeZone={tz}
          values={{
            id,
            title: task.title,
            details: task.details,
            doneMeans: task.doneMeans,
            assigneeId: task.assigneeId,
            dueDate: task.dueDate,
            dueTime: task.dueTime ?? "",
            priority: task.priority,
            link: task.link ?? "",
          }}
        />
      </div>
    </div>
  );
}
