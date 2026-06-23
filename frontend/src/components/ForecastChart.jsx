"use client";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";

const THRESHOLDS = {
  "O+": 15, "O-": 5, "A+": 10, "A-": 4,
  "B+": 8,  "B-": 3, "AB+": 5, "AB-": 2,
};

const BLOOD_COLORS = {
  "O+":  "#EF4444", "O-":  "#F97316",
  "A+":  "#3B82F6", "A-":  "#6366F1",
  "B+":  "#10B981", "B-":  "#14B8A6",
  "AB+": "#A855F7", "AB-": "#EC4899",
};

function CustomTooltip({ active, payload, label, bloodType }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-lg p-3 shadow-xl text-sm">
      <p className="font-semibold text-text mb-2">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="text-xs">
          {p.name}: <strong>{p.value} units</strong>
        </p>
      ))}
    </div>
  );
}

export default function ForecastChart({ bloodType = "O+", predictions = [], history = [] }) {
  const threshold = THRESHOLDS[bloodType] ?? 5;
  const accent    = BLOOD_COLORS[bloodType] ?? "#EF4444";

  // Merge history (last 7 days) + predictions (next 7 days)
  const historyFormatted = history.slice(-7).map((h) => ({
    date:   new Date(h.log_date).toLocaleDateString("en-KE", { weekday: "short", month: "short", day: "numeric" }),
    stock:  h.closing_stock,
    usage:  h.units_used,
    type:   "actual",
  }));

  const forecastFormatted = predictions.map((p) => ({
    date:     new Date(p.prediction_date).toLocaleDateString("en-KE", { weekday: "short", month: "short", day: "numeric" }),
    forecast: Math.max(0, Math.round(p.predicted_units)),
    type:     "forecast",
  }));

  // Combine: actual history on the left, forecast on the right
  const combined = [
    ...historyFormatted,
    ...forecastFormatted,
  ];

  if (!combined.length) {
    return (
      <div className="flex items-center justify-center h-48 text-muted text-sm">
        No forecast data available. Run a prediction first.
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={combined} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#6B7280", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#6B7280", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip bloodType={bloodType} />} />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "#6B7280", paddingTop: 12 }}
          />

          {/* Critical threshold line */}
          <ReferenceLine
            y={threshold}
            stroke="#EF4444"
            strokeDasharray="6 3"
            label={{ value: "Critical", fill: "#EF4444", fontSize: 10, position: "insideTopRight" }}
          />

          {/* Actual stock bars */}
          <Bar
            dataKey="stock"
            name="Actual Stock"
            fill={accent}
            fillOpacity={0.7}
            radius={[3, 3, 0, 0]}
            maxBarSize={36}
          />

          {/* Forecast bars */}
          <Bar
            dataKey="forecast"
            name="Predicted Stock"
            fill={accent}
            fillOpacity={0.3}
            radius={[3, 3, 0, 0]}
            maxBarSize={36}
            strokeDasharray="4 2"
            stroke={accent}
            strokeWidth={1}
          />

          {/* Usage line */}
          <Line
            dataKey="usage"
            name="Daily Usage"
            stroke="#F59E0B"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#F59E0B" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
