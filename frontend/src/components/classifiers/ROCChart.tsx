"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

type Props = {
  fpr: number[];
  tpr: number[];
};

export default function ROCChart({ fpr, tpr }: Props) {
  const data = fpr.map((f, i) => ({ fpr: f, tpr: tpr[i] }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="fpr"
          type="number"
          domain={[0, 1]}
          label={{ value: "False Positive Rate", position: "insideBottom", offset: -5 }}
          tickFormatter={(v: number) => v.toFixed(1)}
        />
        <YAxis
          domain={[0, 1]}
          label={{ value: "True Positive Rate", angle: -90, position: "insideLeft" }}
          tickFormatter={(v: number) => v.toFixed(1)}
        />
        <Tooltip
          formatter={(v: number) => v.toFixed(4)}
          labelFormatter={(v: number) => `FPR: ${v.toFixed(4)}`}
        />
        <ReferenceLine
          segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
          stroke="#ccc"
          strokeDasharray="5 5"
        />
        <Line
          type="monotone"
          dataKey="tpr"
          stroke="#4f46e5"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
