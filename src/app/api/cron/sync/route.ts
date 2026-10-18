import { NextResponse, type NextRequest } from "next/server";
import { runAllSyncs } from "@/lib/sync";

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
  const ok = results.every((r) => r.ok);
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 500 });
}

export const POST = GET;
