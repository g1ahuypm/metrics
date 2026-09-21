"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";

export type BarSeries = { key: string; label: string; color: string };

type Point = { date: string } & Record<string, unknown>;

export function BarSeriesChart({
  data,
  series,
  currency = "USD",
  height = 240,
  format = "money",
  stacked = false,
}: {
  data: Point[];
  series: BarSeries[];
  currency?: string;
  height?: number;
  format?: "money" | "number";
  stacked?: boolean;
}) {
  const fmt = (v: number) => (format === "number" ? fmtNumber(v) : fmtMoney(v, currency));
  const yFmt = (v: number) => (format === "number" ? fmtNumber(v) : fmtMoney(v, currency, { compact: true, decimals: 0 }));
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%" barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => fmtDate(v)}
            tick={{ fill: "var(--ink-3)", fontSize: 11 }}
            axisLine={{ stroke: "var(--grid)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis tickFormatter={yFmt} tick={{ fill: "var(--ink-3)", fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--ink)",
            }}
            labelStyle={{ color: "var(--ink)", fontWeight: 500 }}
            itemStyle={{ color: "var(--ink-2)" }}
            labelFormatter={(v) => fmtDate(String(v), { weekday: "short", month: "short", day: "numeric" })}
            formatter={(v) => fmt(Number(v))}
          />
          {series.length > 1 && (
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value) => <span style={{ color: "var(--ink-2)" }}>{value}</span>}
            />
          )}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              stackId={stacked ? "a" : undefined}
              maxBarSize={24}
              radius={stacked ? 0 : [4, 4, 0, 0]}
              stroke="var(--surface)"
              strokeWidth={stacked ? 1 : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
