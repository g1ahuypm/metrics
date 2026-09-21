import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveRange, toISODate } from "@/lib/dates";
import { getMetrics, cents } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "date", "orders", "units", "newCustomers", "returningCustomers", "grossSales", "discounts", "refunds", "netSales",
  "shippingCharged", "tax", "revenue", "cogs", "shippingCost", "handlingCost", "paymentFees", "platformFees",
  "grossProfit", "adSpend", "customCosts", "netProfit", "impressions", "clicks", "adPurchases", "adPurchaseValue",
] as const;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const range = resolveRange({ range: sp.get("range") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  const { daily, totals } = await getMetrics(range);

  const lines = [COLUMNS.join(",")];
  for (const d of daily) {
    lines.push(COLUMNS.map((c) => (typeof d[c] === "number" ? String(cents(d[c] as number)) : d[c])).join(","));
  }
  lines.push(COLUMNS.map((c) => (c === "date" ? "TOTAL" : String(cents(totals[c] as number)))).join(","));

  const filename = `profit-${toISODate(range.from)}_${toISODate(range.to)}.csv`;
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
