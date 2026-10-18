import { NextResponse, type NextRequest } from "next/server";
import { runSupport } from "@/lib/support/run";
import { getMailConfig } from "@/lib/support/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret") === secret;
}

/** Checks the support inbox and answers new emails. Called every few minutes by the scheduler. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Not connected yet is not a failure: the scheduler simply has nothing to do.
  if (!(await getMailConfig())) return NextResponse.json({ ok: true, skipped: "The support mailbox is not connected yet" });
  try {
    const result = await runSupport();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const POST = GET;
