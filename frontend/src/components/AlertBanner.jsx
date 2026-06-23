"use client";
import { AlertTriangle, Zap, X, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

export default function AlertBanner({ alerts = [], onDismiss, onAction }) {
  if (!alerts.length) return null;

  const urgent     = alerts.filter(a => a.alert_type === "URGENT");
  const proactive  = alerts.filter(a => a.alert_type === "PROACTIVE");

  return (
    <div className="flex flex-col gap-2 mb-6">
      {urgent.map((a) => (
        <div key={a.id} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-crimson/15 border border-crimson/40 animate-[fadeIn_0.3s_ease-out]">
          <Zap className="w-5 h-5 text-crimson mt-0.5 shrink-0 animate-pulse" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-crimson">
              URGENT — {a.blood_type} blood critically needed
            </p>
            <p className="text-xs text-text-dim mt-0.5">{a.message_subject}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onAction && (
              <button
                onClick={() => onAction(a)}
                className="text-xs text-crimson font-semibold flex items-center gap-1 hover:underline"
              >
                Review <ChevronRight className="w-3 h-3" />
              </button>
            )}
            {onDismiss && (
              <button onClick={() => onDismiss(a.id)} className="text-muted hover:text-text">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}

      {proactive.map((a) => (
        <div key={a.id} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-warn/10 border border-warn/30 animate-[fadeIn_0.3s_ease-out]">
          <AlertTriangle className="w-5 h-5 text-warn mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-warn">
              Predicted Shortage — {a.blood_type} · {a.shortage_date}
            </p>
            <p className="text-xs text-text-dim mt-0.5">
              ML model forecasts stock will drop below threshold in{" "}
              {Math.ceil((new Date(a.shortage_date) - new Date()) / 86400000)} day(s).
              Admin approval needed before broadcast.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onAction && (
              <button
                onClick={() => onAction(a)}
                className="text-xs text-warn font-semibold flex items-center gap-1 hover:underline"
              >
                Review <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
