"use client";
import { clsx } from "clsx";
import { AlertTriangle, CheckCircle, XCircle, TrendingDown } from "lucide-react";

const THRESHOLDS = {
  "O+": 15, "O-": 5, "A+": 10, "A-": 4,
  "B+": 8,  "B-": 3, "AB+": 5, "AB-": 2,
};

const MAX_STOCK = {
  "O+": 120, "O-": 30, "A+": 80, "A-": 25,
  "B+": 60,  "B-": 20, "AB+": 40, "AB-": 15,
};

function getStatus(bloodType, units, shortageFlag) {
  const threshold = THRESHOLDS[bloodType] ?? 5;
  if (shortageFlag) return "predicted";
  if (units === 0)  return "empty";
  if (units <= threshold) return "critical";
  if (units <= threshold * 2) return "low";
  return "ok";
}

const STATUS_CONFIG = {
  ok:        { color: "text-safe",    bg: "bg-safe/10",    bar: "bg-safe",    icon: CheckCircle,   label: "Sufficient" },
  low:       { color: "text-warn",    bg: "bg-warn/10",    bar: "bg-warn",    icon: AlertTriangle, label: "Low" },
  critical:  { color: "text-crimson", bg: "bg-crimson/10", bar: "bg-crimson", icon: XCircle,       label: "Critical" },
  empty:     { color: "text-crimson", bg: "bg-crimson/15", bar: "bg-crimson", icon: XCircle,       label: "Stockout" },
  predicted: { color: "text-warn",    bg: "bg-warn/10",    bar: "bg-warn",    icon: TrendingDown,  label: "Shortage Predicted" },
};

export default function BloodTypeCard({ bloodType, units = 0, shortageFlag = false, shortageDate, onClick }) {
  const status = getStatus(bloodType, units, shortageFlag);
  const cfg    = STATUS_CONFIG[status];
  const Icon   = cfg.icon;
  const max    = MAX_STOCK[bloodType] ?? 100;
  const pct    = Math.min(100, Math.round((units / max) * 100));

  return (
    <button
      onClick={onClick}
      className={clsx(
        "card text-left w-full transition-all duration-200 hover:border-muted cursor-pointer group",
        status === "critical" || status === "empty" ? "border-crimson/40" :
        status === "predicted" ? "border-warn/40" : ""
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-muted font-medium uppercase tracking-widest mb-1">Blood Type</p>
          <p className="text-3xl font-bold font-mono tracking-tight">{bloodType}</p>
        </div>
        <div className={clsx("p-2 rounded-lg", cfg.bg)}>
          <Icon className={clsx("w-5 h-5", cfg.color)} />
        </div>
      </div>

      {/* Units count */}
      <div className="mb-3">
        <span className="text-2xl font-bold font-mono">{units}</span>
        <span className="text-muted text-sm ml-1.5">units</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-raised rounded-full overflow-hidden mb-3">
        <div
          className={clsx("h-full rounded-full transition-all duration-700", cfg.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Status badge + threshold */}
      <div className="flex items-center justify-between">
        <span className={clsx(
          "text-xs font-semibold px-2 py-0.5 rounded-full",
          cfg.bg, cfg.color
        )}>
          {cfg.label}
        </span>
        <span className="text-xs text-muted">
          min {THRESHOLDS[bloodType]} units
        </span>
      </div>

      {/* Shortage date badge */}
      {shortageFlag && shortageDate && (
        <div className="mt-3 pt-3 border-t border-border flex items-center gap-1.5 text-xs text-warn">
          <TrendingDown className="w-3.5 h-3.5" />
          <span>Projected shortage: <strong>{shortageDate}</strong></span>
        </div>
      )}
    </button>
  );
}
