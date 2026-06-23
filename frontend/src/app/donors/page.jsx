"use client";
import { useState, useEffect } from "react";
import { Plus, UserCheck, UserX, Search, Loader2 } from "lucide-react";
import { donors } from "../../lib/api";
import { format, differenceInDays } from "date-fns";

const BLOOD_TYPES = ["", "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

const COUNTIES = [
  "Nairobi","Kiambu","Machakos","Kajiado","Murang'a","Nakuru",
  "Mombasa","Kisumu","Uasin Gishu","Nandi","Meru","Other"
];

export default function DonorsPage() {
  const [donorList,  setDonorList]  = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [filters,    setFilters]    = useState({ blood_type: "", eligible_only: false });
  const [form,       setForm]       = useState({
    full_name: "", email: "", phone: "", blood_type: "O+",
    county: "Nairobi", date_of_birth: "", opted_in_sms: true, opted_in_email: true,
  });

  async function load() {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 15,
        ...(filters.blood_type && { blood_type: filters.blood_type }),
        ...(filters.eligible_only && { eligible_only: "true" }),
      };
      const { data } = await donors.list(params);
      setDonorList(data.donors || []);
      setTotal(data.total || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [page, filters]);

  async function handleRegister(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await donors.register(form);
      setShowForm(false);
      setForm({ full_name: "", email: "", phone: "", blood_type: "O+", county: "Nairobi", date_of_birth: "", opted_in_sms: true, opted_in_email: true });
      await load();
    } catch (err) {
      alert(err.response?.data?.error || "Registration failed");
    } finally { setSaving(false); }
  }

  async function handleRecordDonation(id) {
    const today = new Date().toISOString().split("T")[0];
    await donors.recordDonation(id, today);
    await load();
  }

  function eligibilityLabel(d) {
    if (!d.last_donation_date) return { label: "Never donated", cls: "badge-info" };
    const days = differenceInDays(new Date(), new Date(d.last_donation_date));
    if (days >= 56) return { label: "Eligible", cls: "badge-safe" };
    return { label: `Eligible in ${56 - days}d`, cls: "badge-warning" };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Donor Registry</h1>
          <p className="text-sm text-muted mt-1">
            {total} registered donor{total !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus className="w-4 h-4" /> Register Donor
        </button>
      </div>

      {/* Registration form */}
      {showForm && (
        <div className="card border-info/30">
          <h2 className="font-semibold mb-4">New Donor Registration</h2>
          <form onSubmit={handleRegister} className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs text-muted mb-1">Full Name *</label>
              <input className="input" placeholder="Faith Atieno" required
                value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Blood Type *</label>
              <select className="input" value={form.blood_type}
                onChange={e => setForm({...form, blood_type: e.target.value})}>
                {BLOOD_TYPES.filter(Boolean).map(bt => <option key={bt}>{bt}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Email</label>
              <input type="email" className="input" placeholder="faith@email.com"
                value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Phone</label>
              <input className="input" placeholder="+254712345678"
                value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">County *</label>
              <select className="input" value={form.county}
                onChange={e => setForm({...form, county: e.target.value})}>
                {COUNTIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Date of Birth *</label>
              <input type="date" className="input" required
                value={form.date_of_birth} onChange={e => setForm({...form, date_of_birth: e.target.value})} />
            </div>
            <div className="col-span-2 flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.opted_in_email}
                  onChange={e => setForm({...form, opted_in_email: e.target.checked})}
                  className="accent-crimson" />
                <span className="text-text-dim">Email alerts</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.opted_in_sms}
                  onChange={e => setForm({...form, opted_in_sms: e.target.checked})}
                  className="accent-crimson" />
                <span className="text-text-dim">SMS alerts</span>
              </label>
            </div>
            <div className="col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {saving ? "Registering…" : "Register"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <select className="input pl-8 w-36"
            value={filters.blood_type}
            onChange={e => setFilters({...filters, blood_type: e.target.value})}>
            {BLOOD_TYPES.map(bt => <option key={bt} value={bt}>{bt || "All Types"}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
          <input type="checkbox" checked={filters.eligible_only}
            onChange={e => setFilters({...filters, eligible_only: e.target.checked})}
            className="accent-crimson" />
          Eligible only
        </label>
        <span className="text-xs text-muted ml-auto">{total} result{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Donors table */}
      <div className="card">
        {loading ? (
          <div className="flex items-center gap-2 text-muted py-8 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading donors…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Blood Type</th>
                  <th>County</th>
                  <th>Last Donation</th>
                  <th>Eligibility</th>
                  <th>Contact</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {donorList.map(d => {
                  const { label, cls } = eligibilityLabel(d);
                  return (
                    <tr key={d.id}>
                      <td className="font-medium">{d.full_name}</td>
                      <td><span className="font-bold font-mono">{d.blood_type}</span></td>
                      <td className="text-text-dim">{d.county}</td>
                      <td className="text-text-dim text-sm">
                        {d.last_donation_date ? format(new Date(d.last_donation_date), "dd MMM yyyy") : "—"}
                      </td>
                      <td><span className={cls}>{label}</span></td>
                      <td className="text-xs text-muted">{d.email || d.phone || "—"}</td>
                      <td>
                        {d.is_eligible && (
                          <button
                            onClick={() => handleRecordDonation(d.id)}
                            className="btn-ghost text-safe text-xs"
                            title="Record donation today"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!donorList.length && (
              <p className="text-muted text-sm text-center py-8">
                No donors found. Register the first donor above.
              </p>
            )}
          </div>
        )}

        {/* Pagination */}
        {total > 15 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border text-sm">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary">
              Previous
            </button>
            <span className="text-muted">Page {page} · {total} total</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page * 15 >= total} className="btn-secondary">
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
