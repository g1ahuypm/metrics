import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Unread inbox items and overdue tasks, for the bell and the sidebar to stay current between pages. */
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [unread, overdue] = await Promise.all([
    db.notification.count({ where: { userId: me.id, readAt: null } }),
    db.task.count({ where: { assigneeId: me.id, status: "open", dueAt: { lte: new Date() } } }),
  ]);
  return NextResponse.json({ unread, overdue });
}
