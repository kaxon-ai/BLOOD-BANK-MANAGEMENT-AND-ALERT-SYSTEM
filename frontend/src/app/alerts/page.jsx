"use client";
import { useState, useEffect } from "react";
import { Bell, CheckCircle, XCircle, Send, Plus, Loader2, Brain, Zap } from "lucide-react";
import { alerts, predictions } from "../../lib/api";
import { format } from "date-fns";
import { useAuth } from "../layout";

const STATUS_CFG = {
  PENDING:   { cls: "badge-warning",  label: "Pending Approval" },
  APPROVED:  { cls: "badge-info",     label: "Approved" },
  SENT:      { cls: "badge-safe",     label: "Sent" },
  CANCELLED: { cls: "badge-critical", label: "Cancelled" },
};

const TYPE_CFG = {
  PROACTIVE: { cls: "badge-warning", icon: Brain, label: "Proactive" },
  URGENT:    { cls: "badge-critical", icon: Zap,   label: "Urgent" },
};

export default function AlertsPage() {
  const { user } = useAuth() || {};
  const isAdmin = user?.role === "ADMIN";

  const [alertList,  setAlertList]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [acting,     setActing]     = useState(null); // alert id being actioned
  const [showForm,   setShowForm]   = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [form, setForm] = useState({
    blood_type: "O+", alert_type: "URGENT",
    message_subject: "", message_body: "", threshold_units: 15,
  });

  const BLOOD_TYPES = ["O+","O-","A+","A-","B+","B-","AB+","AB-"];

  async function load() {
    setLoading(true);
    try {
      const params = filterStatus ? { status: filterStatus } : {};
      const { data } = await alerts.list(params);
      setAlertList(data.alerts || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [filterStatus]);

  async function handleApprove(id) {
    setActing(id);
    try { await alerts.approve(id); await load(); }
    catch (err) { alert(err.response?.data?.error || "Failed"); }
    finally { setActing(null); }
  }

  async function handleBroadcast(id) {
    if (!confirm("Send this alert to all eligible donors now?")) return;
    setActing(id);
    try {
      const { data } = await alerts.broadcast(id);
      alert(`✅ Sent to ${data.recipients} donor(s).`);
      await load();
    } catch (err) { alert(err.response?.data?.error || "Broadcast failed"); }
    finally { setActing(null); }
  }

  async function handleCancel(id) {
    setActing(id);
    try { await alerts.cancel(id); await load(); }
    catch { /* silent */ }
    finally { setActing(null); }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      await alerts.create({ ...form, threshold_units: Number(form.threshold_units) });
      setShowForm(false);
      await load();
    } catch (err) { alert(err.response?.data?.error || "Failed to create alert"); }
  }

  async function handleRunPrediction() {
    try {
      await predictions.run();
      await load();
      alert("Prediction run complete. Check for new PENDING alerts.");
    } catch (err) { alert("ML service error: " + err.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Alert Management</h1>
          <p className="text-sm text-muted mt-1">Review ML-generated and manual shortage alerts</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={handleRunPrediction} className="btn-secondary">
              <Brain className="w-4 h-4" /> Run ML Now
            </button>
            <button onClick={() => setShowForm(!showForm)} className="btn-primary">
              <Plus className="w-4 h-4" /> Manual Alert
            </button>
          </div>
        )}
      </div>

      {/* Manual alert form */}
      {showForm && (
        <div className="card border-crimson/30">
          <h2 className="font-semibold mb-4">Create Manual Alert</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1">Blood Type</label>
                <select className="input" value={form.blood_type}
                  onChange={e => setForm({...form, blood_type: e.target.value})}>
                  {BLOOD_TYPES.map(bt => <option key={bt}>{bt}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Alert Type</label>
                <select className="input" value={form.alert_type}
                  onChange={e => setForm({...form, alert_type: e.target.value})}>
                  <option value="URGENT">URGENT</option>
                  <option value="PROACTIVE">PROACTIVE</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Critical Threshold (units)</label>
                <input type="number" className="input" value={form.threshold_units}
                  onChange={e => setForm({...form, threshold_units: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Subject Line</label>
              <input className="input" placeholder="Urgent: O+ blood critically needed"
                value={form.message_subject} onChange={e => setForm({...form, message_subject: e.target.value})} required />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Message Body</label>
              <textarea rows={4} className="input resize-none"
                placeholder="Dear donor, our O+ supply has reached a critical level…"
                value={form.message_body} onChange={e => setForm({...form, message_body: e.target.value})} required />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Create Alert</button>
            </div>
          </form>
        </div>
      )}

      {/* Filter strip */}
      <div className="flex gap-2">
        {["", "PENDING", "APPROVED", "SENT", "CANCELLED"].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterStatus === s
                ? "bg-raised text-text border border-border"
                : "text-muted hover:text-text"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {/* Alert cards */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading alerts…
        </div>
      ) : alertList.length === 0 ? (
        <div className="card text-center py-12 text-muted">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No alerts found</p>
          <p className="text-sm mt-1">Run a prediction or create a manual alert above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alertList.map(a => {
            const sCfg  = STATUS_CFG[a.status];
            const tCfg  = TYPE_CFG[a.alert_type];
            const TIcon = tCfg.icon;
            const isActing = acting === a.id;

            return (
              <div key={a.id} className="card">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <TIcon className={`w-4 h-4 ${a.alert_type === "URGENT" ? "text-crimson" : "text-warn"}`} />
                    <span className={tCfg.cls}>{tCfg.label}</span>
                    <span className="font-bold font-mono">{a.blood_type}</span>
                    <span className={sCfg.cls}>{sCfg.label}</span>
                  </div>
                  <span className="text-xs text-muted">
                    {format(new Date(a.created_at), "dd MMM yyyy · HH:mm")}
                  </span>
                </div>

                <h3 className="font-medium mt-3">{a.message_subject}</h3>
                <p className="text-sm text-muted mt-1 line-clamp-2">{a.message_body}</p>

                {a.shortage_date && (
                  <p className="text-xs text-warn mt-2">
                    Predicted shortage date: <strong>{a.shortage_date}</strong>
                    {a.predicted_units != null && ` (${a.predicted_units} units remaining)`}
                  </p>
                )}
                {a.recipients_count > 0 && (
                  <p className="text-xs text-safe mt-1">Sent to {a.recipients_count} donor(s)</p>
                )}

                {/* Action buttons */}
                {isAdmin && (
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {a.status === "PENDING" && (
                      <>
                        <button disabled={isActing} onClick={() => handleApprove(a.id)} className="btn-secondary text-xs">
                          {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5 text-safe" />}
                          Approve
                        </button>
                        <button disabled={isActing} onClick={() => handleCancel(a.id)} className="btn-secondary text-xs">
                          <XCircle className="w-3.5 h-3.5 text-crimson" /> Cancel
                        </button>
                      </>
                    )}
                    {a.status === "APPROVED" && (
                      <button disabled={isActing} onClick={() => handleBroadcast(a.id)} className="btn-primary text-xs">
                        {isActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        {isActing ? "Broadcasting…" : "Broadcast to Donors"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
