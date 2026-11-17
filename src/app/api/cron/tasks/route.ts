import { NextResponse, type NextRequest } from "next/server";
import { runTaskReminders } from "@/lib/tasks/remind";
import { runTodoReminders } from "@/lib/support/todo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = (req.headers.get("authorization") ?? "").trim();
  return header === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret")?.trim() === secret;
}

/** Sends due-soon and overdue task reminders, and reminders for urgent emails on the Support To do list. Called every few minutes by the scheduler. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runTaskReminders();
    const supportTodo = await runTodoReminders();
    return NextResponse.json({ ok: true, ...result, supportTodo });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const POST = GET;
