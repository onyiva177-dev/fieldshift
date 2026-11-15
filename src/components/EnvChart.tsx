"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SeriesDef { key: string; label: string; color: string; dashed?: boolean }

interface Props {
  title: string;
  description?: string;
  type: "line" | "bar";
  data: Record<string, string | number | null>[];
  series: SeriesDef[];
  unit: string;
  refLine?: number;
  height?: number;
  summary: string; // read aloud by screen readers
}

export default function EnvChart({ title, description, type, data, series, unit, refLine, height = 260, summary }: Props) {
  const common = { data, margin: { top: 8, right: 12, bottom: 0, left: 0 } };
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#d6d3d1" />
      <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" minTickGap={28} />
      <YAxis tick={{ fontSize: 12 }} width={44} />
      <Tooltip formatter={(v) => (typeof v === "number" ? `${Math.round(v * 100) / 100} ${unit}` : "no data")} />
      {series.length > 1 && <Legend wrapperStyle={{ fontSize: 13 }} />}
      {refLine !== undefined && <ReferenceLine y={refLine} stroke="#57534e" strokeDasharray="4 4" />}
    </>
  );

  return (
    <figure className="card">
      <figcaption className="mb-3">
        <span className="block text-lg font-bold">{title}</span>
        {description && <span className="block text-sm">{description}</span>}
        <span className="block text-sm text-stone-700">Unit: {unit}</span>
      </figcaption>
      <div role="img" aria-label={summary} style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === "line" ? (
            <LineChart {...common}>
              {axes}
              {series.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.5}
                  strokeDasharray={s.dashed ? "6 4" : undefined} dot={false} connectNulls={false} isAnimationActive={false} />
              ))}
            </LineChart>
          ) : (
            <BarChart {...common}>
              {axes}
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} isAnimationActive={false}>
                  {data.map((d, i) => <Cell key={i} fill={typeof d.fill === "string" ? d.fill : s.color} />)}
                </Bar>
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
