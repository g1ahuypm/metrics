import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runTest } from "@/lib/support/aitest";
import { FIXTURES } from "@/lib/support/fixtures";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = (req.headers.get("authorization") ?? "").trim();
  return header === `Bearer ${secret}`;
}

/**
 * Runs one standard test email (made-up customer, nothing stored or sent) through the support AI,
 * for the "Test support AI" workflow: ?case=03&compare=1&store=LearnWell
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const fixture = FIXTURES.find((f) => f.id === q.get("case"));
  if (!fixture) return NextResponse.json({ error: "Unknown case", cases: FIXTURES.map((f) => f.id) }, { status: 400 });
  const storeName = q.get("store")?.trim();
  const store = await db.store.findFirst({ where: storeName ? { name: storeName } : {}, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  if (!store) return NextResponse.json({ error: "No such store" }, { status: 400 });
  const [current, previous] = await Promise.all([runTest(store.id, fixture, "current"), q.get("compare") ? runTest(store.id, fixture, "previous") : Promise.resolve(undefined)]);
  return NextResponse.json({ case: fixture.id, title: fixture.title, store: store.name, expected: fixture.expected, checks: fixture.checks, current, previous });
}
