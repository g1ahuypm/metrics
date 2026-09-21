"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";

export type Series = {
  key: string;
  label: string;
  color: string; // CSS variable reference, e.g. "var(--series-1)"
  area?: boolean;
  format?: "money" | "number";
};

type Point = { date: string } & Record<string, unknown>;

function CustomTooltip({
  active,
  payload,
  label,
  series,
  currency,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  label?: string;
  series: Series[];
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-ink">
        {label ? fmtDate(label, { weekday: "short", month: "short", day: "numeric" }) : ""}
      </div>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        if (!p) return null;
        return (
          <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
            <span className="inline-flex items-center gap-1.5 text-ink-2">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="tnum font-medium text-ink">
              {s.format === "number" ? fmtNumber(p.value) : fmtMoney(p.value, currency)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TimeSeriesChart({
  data,
  series,
  currency = "USD",
  height = 280,
  format = "money",
}: {
  data: Point[];
  series: Series[];
  currency?: string;
  height?: number;
  format?: "money" | "number";
}) {
  const few = data.length <= 2;
  const yFmt = (v: number) =>
    format === "number" ? fmtNumber(v) : fmtMoney(v, currency, { compact: true, decimals: 0 });
  const xFmt = (v: string) => fmtDate(v, data.length > 45 ? { month: "short", day: "numeric" } : { month: "short", day: "numeric" });

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series
              .filter((s) => s.area)
              .map((s) => (
                <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
          <XAxis
            dataKey="date"
            tickFormatter={xFmt}
            tick={{ fill: "var(--ink-3)", fontSize: 11 }}
            axisLine={{ stroke: "var(--grid)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={yFmt}
            tick={{ fill: "var(--ink-3)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            content={<CustomTooltip series={series} currency={currency} />}
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
          />
          {series.length > 1 && (
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, color: "var(--ink-2)", paddingTop: 8 }}
              formatter={(value) => <span style={{ color: "var(--ink-2)" }}>{value}</span>}
            />
          )}
          {series.map((s) =>
            s.area ? (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                fill={`url(#fill-${s.key})`}
                dot={few ? { r: 4, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 } : false}
                activeDot={{ r: 5, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ) : (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={few ? { r: 4, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 } : false}
                activeDot={{ r: 5, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
