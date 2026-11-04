import { NextResponse, type NextRequest } from "next/server";
import { runAllSyncs } from "@/lib/sync";
import { syncAllBanks } from "@/lib/cash/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  // Trimmed on both sides: a space or line break copied along with the value shouldn't lock the scheduler out.
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = (req.headers.get("authorization") ?? "").trim();
  return header === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret")?.trim() === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await runAllSyncs();
  // The bank comes after Shopify, so new payouts are known when deposits are matched to them.
  const banks = await syncAllBanks();
  // A bank asking to log in again is shown on the Cash page; it doesn't fail the scheduled check.
  const ok = results.every((r) => r.ok);
  return NextResponse.json({ ok, results, banks }, { status: ok ? 200 : 500 });
}

export const POST = GET;
