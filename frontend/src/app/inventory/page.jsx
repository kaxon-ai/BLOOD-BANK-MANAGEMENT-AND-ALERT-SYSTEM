"use client";
import { useState, useEffect } from "react";
import { Plus, Package, AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { inventory } from "../../lib/api";
import { format, differenceInDays } from "date-fns";

const BLOOD_TYPES = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

function ExpiryBadge({ expiryDate }) {
  const days = differenceInDays(new Date(expiryDate), new Date());
  if (days < 0)  return <span className="badge-critical">Expired</span>;
  if (days <= 7) return <span className="badge-critical">{days}d left</span>;
  if (days <= 14)return <span className="badge-warning">{days}d left</span>;
  return <span className="badge-safe">{days}d left</span>;
}

export default function InventoryPage() {
  const [batches,  setBatches]  = useState([]);
  const [summary,  setSummary]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState({ blood_type: "O+", units: "", expiry_date: "", batch_code: "" });
  const [saving,   setSaving]   = useState(false);
  const [logForm,  setLogForm]  = useState({ blood_type: "O+", units_used: "" });
  const [logging,  setLogging]  = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [bRes, sRes] = await Promise.all([inventory.list(), inventory.summary()]);
      setBatches(bRes.data.inventory || []);
      setSummary(sRes.data.summary   || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleAddBatch(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await inventory.add({ ...form, units: Number(form.units) });
      setForm({ blood_type: "O+", units: "", expiry_date: "", batch_code: "" });
      setShowForm(false);
      await load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to add batch");
    } finally { setSaving(false); }
  }

  async function handleLogUsage(e) {
    e.preventDefault();
    setLogging(true);
    try {
      await inventory.logUsage({ blood_type: logForm.blood_type, units_used: Number(logForm.units_used) });
      setLogForm({ blood_type: "O+", units_used: "" });
      await load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to log usage");
    } finally { setLogging(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this batch? This cannot be undone.")) return;
    await inventory.remove(id);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Blood Inventory</h1>
          <p className="text-sm text-muted mt-1">Manage stock batches and log daily usage</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Batch
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summary.map(s => (
          <div key={s.blood_type} className="card">
            <p className="text-2xl font-bold font-mono">{s.blood_type}</p>
            <p className="text-lg font-semibold mt-1">{s.total_units} <span className="text-muted text-sm">units</span></p>
            {s.nearest_expiry && (
              <p className="text-xs text-muted mt-1">
                Next expiry: {format(new Date(s.nearest_expiry), "dd MMM")}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Add batch form */}
      {showForm && (
        <div className="card border-crimson/30">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-crimson" /> New Blood Batch
          </h2>
          <form onSubmit={handleAddBatch} className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Blood Type</label>
              <select className="input" value={form.blood_type} onChange={e => setForm({...form, blood_type: e.target.value})}>
                {BLOOD_TYPES.map(bt => <option key={bt}>{bt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Units</label>
              <input type="number" min="1" className="input" placeholder="e.g. 20"
                value={form.units} onChange={e => setForm({...form, units: e.target.value})} required />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Expiry Date</label>
              <input type="date" className="input"
                value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} required />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Batch Code</label>
              <input type="text" className="input" placeholder="e.g. KNH-2025-OP-003"
                value={form.batch_code} onChange={e => setForm({...form, batch_code: e.target.value})} required />
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? "Saving…" : "Add Batch"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Log usage form */}
      <div className="card">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warn" /> Log Daily Usage
        </h2>
        <form onSubmit={handleLogUsage} className="flex gap-3 flex-wrap">
          <select className="input w-32" value={logForm.blood_type}
            onChange={e => setLogForm({...logForm, blood_type: e.target.value})}>
            {BLOOD_TYPES.map(bt => <option key={bt}>{bt}</option>)}
          </select>
          <input type="number" min="0" placeholder="Units used today" className="input w-48"
            value={logForm.units_used} onChange={e => setLogForm({...logForm, units_used: e.target.value})} required />
          <button type="submit" disabled={logging} className="btn-primary">
            {logging ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {logging ? "Logging…" : "Log Usage"}
          </button>
        </form>
        <p className="text-xs text-muted mt-2">Run this at end-of-day. It feeds the ML training data.</p>
      </div>

      {/* Batches table */}
      <div className="card">
        <h2 className="font-semibold mb-4">All Batches</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-muted py-8 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Batch Code</th>
                  <th>Blood Type</th>
                  <th>Units</th>
                  <th>Expiry</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id}>
                    <td className="font-mono text-xs text-text-dim">{b.batch_code}</td>
                    <td><span className="font-bold">{b.blood_type}</span></td>
                    <td className="font-mono">{b.units}</td>
                    <td>{format(new Date(b.expiry_date), "dd MMM yyyy")}</td>
                    <td><ExpiryBadge expiryDate={b.expiry_date} /></td>
                    <td>
                      <button onClick={() => handleDelete(b.id)}
                        className="text-muted hover:text-crimson transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!batches.length && (
              <p className="text-muted text-sm text-center py-8">No inventory batches found. Add your first batch above.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
