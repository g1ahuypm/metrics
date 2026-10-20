import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ensureStores } from "@/lib/stores";
import { runSupport } from "@/lib/support/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  // Trimmed on both sides: a space or line break copied along with the value shouldn't lock the scheduler out.
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = (req.headers.get("authorization") ?? "").trim();
  return header === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret")?.trim() === secret;
}

/** Checks every store's support inbox and answers new emails. Called every few minutes by the scheduler. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureStores();
  const stores = await db.store.findMany({
    where: { supportEmail: { not: null }, supportAppPassword: { not: null } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  // Not connected yet is not a failure: the scheduler simply has nothing to do.
  if (stores.length === 0) return NextResponse.json({ ok: true, skipped: "No support mailbox is connected yet" });
  // Each store gets its share of the hosting time limit.
  const budgetMs = Math.max(4_000, Math.floor(12_000 / stores.length));
  const results: Record<string, unknown> = {};
  let ok = true;
  for (const s of stores) {
    try {
      results[s.name] = await runSupport(s.id, { budgetMs });
    } catch (err) {
      ok = false;
      results[s.name] = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return NextResponse.json({ ok, stores: results }, { status: ok ? 200 : 500 });
}

export const POST = GET;
