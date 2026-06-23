"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingDown, RefreshCw, Package, Users,
  Bell, Activity, Loader2, Brain
} from "lucide-react";
import { useAuth } from "./layout";
import BloodTypeCard from "../components/BloodTypeCard";
import ForecastChart from "../components/ForecastChart";
import AlertBanner   from "../components/AlertBanner";
import { inventory, alerts, predictions } from "../lib/api";

const ALL_TYPES = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

export default function Dashboard() {
  const { user, token } = useAuth() || {};
  const router = useRouter();

  const [summary,      setSummary]      = useState([]);
  const [pendingAlerts,setPendingAlerts] = useState([]);
  const [preds,        setPreds]         = useState([]);
  const [shortages,    setShortages]     = useState([]);
  const [selectedType, setSelectedType]  = useState("O+");
  const [history,      setHistory]       = useState([]);
  const [loading,      setLoading]       = useState(true);
  const [running,      setRunning]       = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [sumRes, alertRes, predRes, shortRes] = await Promise.all([
        inventory.summary(),
        alerts.list({ status: "PENDING" }),
        predictions.list(),
        predictions.shortages(),
      ]);
      setSummary(sumRes.data.summary || []);
      setPendingAlerts(alertRes.data.alerts || []);
      setPreds(predRes.data.predictions || []);
      setShortages(shortRes.data.shortages || []);
    } catch (err) {
      console.error("Dashboard load error:", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) { router.push("/login"); return; }
    loadData();
  }, [token, loadData, router]);

  // Load history + predictions for selected blood type
  useEffect(() => {
    if (!token) return;
    predictions.history(selectedType, 14)
      .then(r => setHistory(r.data.history || []))
      .catch(() => {});
  }, [selectedType, token]);

  async function handleRunPrediction() {
    setRunning(true);
    try {
      await predictions.run();
      await loadData();
    } catch (err) {
      alert("ML service error: " + (err.response?.data?.error || err.message));
    } finally {
      setRunning(false);
    }
  }

  // Build a map of blood type → current stock
  const stockMap = {};
  summary.forEach(s => { stockMap[s.blood_type] = s.total_units ?? 0; });

  // Shortage prediction map: blood_type → earliest shortage date
  const shortageMap = {};
  shortages.forEach(s => {
    if (!shortageMap[s.blood_type]) shortageMap[s.blood_type] = s.prediction_date;
  });

  // Selected blood type forecast rows
  const selectedPreds = preds.filter(p => p.blood_type === selectedType);

  // Stats
  const totalUnits   = summary.reduce((a, s) => a + (s.total_units ?? 0), 0);
  const typesAtRisk  = Object.keys(shortageMap).length;
  const pendingCount = pendingAlerts.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 gap-3 text-muted">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span>Loading dashboard…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Inventory Dashboard
          </h1>
          <p className="text-sm text-muted mt-1">
            ML-powered 7-day shortage forecasting ·{" "}
            <span className="text-text-dim">{new Date().toLocaleDateString("en-KE", { dateStyle: "full" })}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          {user?.role === "ADMIN" && (
            <button
              onClick={handleRunPrediction}
              disabled={running}
              className="btn-primary"
            >
              {running
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Brain className="w-4 h-4" />
              }
              {running ? "Running ML…" : "Run Prediction"}
            </button>
          )}
        </div>
      </div>

      {/* Pending alert banners */}
      <AlertBanner
        alerts={pendingAlerts}
        onAction={(a) => router.push(`/alerts?id=${a.id}`)}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Units",     value: totalUnits,    icon: Package,       color: "text-info" },
          { label: "Blood Types",     value: `${summary.length}/8`, icon: Activity, color: "text-safe" },
          { label: "Shortages Predicted", value: typesAtRisk, icon: TrendingDown, color: typesAtRisk > 0 ? "text-warn" : "text-safe" },
          { label: "Pending Alerts",  value: pendingCount,  icon: Bell,          color: pendingCount > 0 ? "text-crimson" : "text-safe" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card flex items-center gap-3">
            <div className="p-2 rounded-lg bg-raised">
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-xl font-bold font-mono">{value}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Blood type cards grid */}
      <section>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-widest mb-3">
          Current Stock by Blood Type
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ALL_TYPES.map((bt) => (
            <BloodTypeCard
              key={bt}
              bloodType={bt}
              units={stockMap[bt] ?? 0}
              shortageFlag={!!shortageMap[bt]}
              shortageDate={shortageMap[bt]}
              onClick={() => setSelectedType(bt)}
            />
          ))}
        </div>
      </section>

      {/* 7-Day Forecast Chart */}
      <section className="card">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="font-semibold text-base flex items-center gap-2">
              <Brain className="w-4 h-4 text-crimson" />
              7-Day Predictive Forecast
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Actual stock (14 days back) + ML-predicted stock (7 days forward)
            </p>
          </div>
          {/* Blood type selector tabs */}
          <div className="flex gap-1 flex-wrap">
            {ALL_TYPES.map((bt) => (
              <button
                key={bt}
                onClick={() => setSelectedType(bt)}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-semibold transition-colors ${
                  selectedType === bt
                    ? "bg-crimson text-white"
                    : "bg-raised text-muted hover:text-text"
                }`}
              >
                {bt}
              </button>
            ))}
          </div>
        </div>

        <ForecastChart
          bloodType={selectedType}
          predictions={selectedPreds}
          history={history}
        />

        {/* Legend note */}
        <p className="text-xs text-muted mt-3 flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-crimson rounded" />
          Solid bars = actual stock
          <span className="inline-block w-3 h-0.5 bg-crimson/40 rounded ml-2" />
          Faded bars = ML-predicted stock
          <span className="inline-block w-3 h-0.5 bg-warn rounded ml-2" />
          Line = daily usage
        </p>
      </section>

      {/* Donor eligibility snapshot */}
      <section className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-info" />
            Quick Actions
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => router.push("/inventory")}
            className="btn-secondary justify-center py-3"
          >
            <Package className="w-4 h-4" /> Manage Inventory
          </button>
          <button
            onClick={() => router.push("/donors")}
            className="btn-secondary justify-center py-3"
          >
            <Users className="w-4 h-4" /> Donor Registry
          </button>
          <button
            onClick={() => router.push("/alerts")}
            className="btn-secondary justify-center py-3"
          >
            <Bell className="w-4 h-4" />
            {pendingCount > 0 ? `${pendingCount} Alert(s) Pending` : "View Alerts"}
          </button>
        </div>
      </section>
    </div>
  );
}
