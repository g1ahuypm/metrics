import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Opening an inbox item marks it read, then goes to what it is about. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.redirect(new URL("/login", req.url));
  const { id } = await params;
  const n = await db.notification.findFirst({ where: { id, userId: me.id } });
  if (!n) return NextResponse.redirect(new URL("/inbox", req.url));
  if (!n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  return NextResponse.redirect(new URL(n.href.startsWith("/") ? n.href : "/inbox", req.url));
}
