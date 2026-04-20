// AdminLeavesAppealsPage.jsx — Admin handles APPEALS ONLY
// Leave requests are managed exclusively by HOD → Principal workflow.

import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";

function format12Hour(t) {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hr = parseInt(h, 10);
  return `${hr % 12 === 0 ? 12 : hr % 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

function formatDate(v) {
  if (!v) return "—";
  return new Date(`${v}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }) {
  const cls = { approved: "bg-emerald-50 text-emerald-700 border-emerald-200", rejected: "bg-rose-50 text-rose-700 border-rose-200", pending: "bg-amber-50 text-amber-700 border-amber-200" };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${cls[status] ?? cls.pending}`}>{status}</span>;
}

function RevalidationBadge({ status }) {
  if (!status) return null;
  const cls = { pending: "bg-blue-50 text-blue-700 border-blue-200", completed: "bg-emerald-50 text-emerald-700 border-emerald-200", missed: "bg-rose-50 text-rose-700 border-rose-200" };
  const lbl = { pending: "Re-validate Pending", completed: "Re-validated ✓", missed: "Missed Re-validation" };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls[status] ?? ""}`}>{lbl[status] ?? status}</span>;
}

function Avatar({ user }) {
  const [broken, setBroken] = useState(false);
  if (!user || user.isDeleted) return <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0">?</div>;
  const initials = user.name?.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase() ?? "?";
  
  // Resolve Cloudinary URL
  const src = user.profileImageUrl || user.profileImage || null;
  if (src && !broken) return <img src={src} alt={user.name} onError={() => setBroken(true)} className="h-9 w-9 rounded-full object-cover border border-slate-200 flex-shrink-0" />;
  return <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initials}</div>;
}

// ── Appeal Action Modal ────────────────────────────────────────────────────────
function AppealActionModal({ appeal, onClose, onDone }) {
  const [mode, setMode] = useState(null);
  const [note, setNote] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setError(null);
    let payload;
    if (mode === "approve") payload = { status: "approved", adminResponse: note || undefined };
    else if (mode === "revalidate") {
      if (!startTime || !endTime) { setError("Both times are required."); return; }
      if (startTime >= endTime) { setError("Start must be before end."); return; }
      payload = { status: "approved", requiresRevalidation: true, appealDate: appeal.date, appealStartTime: startTime, appealEndTime: endTime, adminResponse: note || undefined };
    } else payload = { status: "rejected", adminResponse: note || undefined };

    setSaving(true);
    try { await api.put(`/appeals/${appeal._id}/status`, payload); onDone(); }
    catch (err) { setError(err.response?.data?.message || "Failed to update."); }
    finally { setSaving(false); }
  }

  const actions = [
    { key: "approve", icon: "✓", color: "emerald", title: "Approve — Mark Present", desc: "Accept and mark attendance as Present now." },
    { key: "revalidate", icon: "⏱", color: "blue", title: "Approve with Re-validation", desc: "Employee must re-mark within a custom window." },
    { key: "reject", icon: "✕", color: "rose", title: "Reject Appeal", desc: "Deny. Attendance stays absent." },
  ];
  const ctaCls = { approve: "bg-emerald-600 hover:bg-emerald-700", revalidate: "bg-blue-600 hover:bg-blue-700", reject: "bg-rose-600 hover:bg-rose-700" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <Avatar user={appeal.userId} />
            <div>
              <p className="font-semibold text-slate-900">{appeal.userId?.name ?? "Deleted User"}</p>
              <p className="text-xs text-slate-500">Appeal for {formatDate(appeal.date)}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Employee's Reason</p>
          <p className="text-sm text-slate-700">{appeal.reason}</p>
        </div>
        {!mode ? (
          <div className="px-6 py-5 space-y-3">
            {actions.map(({ key, icon, color, title, desc }) => (
              <button key={key} onClick={() => setMode(key)}
                className={`flex w-full items-start gap-3 rounded-2xl border border-${color}-200 bg-${color}-50 px-4 py-3 text-left hover:bg-${color}-100 transition-colors`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-${color}-600 text-white text-xs mt-0.5`}>{icon}</span>
                <div><p className={`text-sm font-semibold text-${color}-800`}>{title}</p><p className={`text-xs text-${color}-600`}>{desc}</p></div>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <button onClick={() => { setMode(null); setError(null); }} className="text-sm text-slate-500 hover:text-slate-700">← Back</button>
            {mode === "revalidate" && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 space-y-3">
                <p className="text-xs font-semibold text-blue-800 uppercase">Re-validation Window</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-blue-700 mb-1">Start Time</label><input type="time" className="input-field w-full" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
                  <div><label className="block text-xs font-medium text-blue-700 mb-1">End Time</label><input type="time" className="input-field w-full" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Note <span className="text-slate-400 font-normal">(optional)</span></label>
              <textarea className="input-field w-full resize-none" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder={mode === "reject" ? "Reason for rejection..." : "Note for employee..."} />
            </div>
            {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">{error}</p>}
            <div className="flex gap-3">
              <button onClick={submit} disabled={saving} className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${ctaCls[mode]}`}>
                {saving ? "Processing…" : mode === "approve" ? "Approve" : mode === "revalidate" ? "Approve & Set Window" : "Reject"}
              </button>
              <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bulk Confirm Modal ─────────────────────────────────────────────────────────
function BulkConfirmModal({ confirm, count, processing, error, onExecute, onClose }) {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [localErr, setLocalErr] = useState(null);
  const isReval = confirm.action === "revalidate";
  const isApprove = confirm.action === "approved";
  const label = isReval ? "Re-validate All" : isApprove ? "Approve All" : "Reject All";
  const ctaCls = isReval ? "bg-blue-600 hover:bg-blue-700" : isApprove ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700";

  function handleConfirm() {
    setLocalErr(null);
    if (isReval) {
      if (!startTime || !endTime) { setLocalErr("Both times are required."); return; }
      if (startTime >= endTime) { setLocalErr("Start must be before end."); return; }
      onExecute({ startTime, endTime });
    } else onExecute(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <div>
            <p className="section-label">Bulk Action</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{label} — {count} {count === 1 ? "Appeal" : "Appeals"}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        {isReval && (
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
            <p className="text-xs font-semibold text-blue-800 uppercase mb-3">Shared Re-validation Window</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-blue-700 mb-1">Start</label><input type="time" className="input-field w-full" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
              <div><label className="block text-xs font-medium text-blue-700 mb-1">End</label><input type="time" className="input-field w-full" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
            </div>
          </div>
        )}
        <div className="px-6 py-4 space-y-3">
          {(error || localErr) && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">{localErr || error}</p>}
          <div className="flex gap-3">
            <button onClick={handleConfirm} disabled={processing} className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${ctaCls}`}>{processing ? "Processing…" : label}</button>
            <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AdminAppealsPage() {
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState("pending");
  const [selectedAppeal, setSelectedAppeal] = useState(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkError, setBulkError] = useState(null);

  async function fetchAppeals() {
    setLoading(true);
    try { const r = await api.get("/appeals/all"); setAppeals(r.data); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchAppeals(); }, []);

  const allDepts = useMemo(() => [...new Set(appeals.map(a => a.userId?.department).filter(Boolean))].sort(), [appeals]);

  const filtered = useMemo(() => appeals.filter(a => {
    if (a.status !== statusTab) return false;
    const q = search.trim().toLowerCase();
    if (q && !a.userId?.name?.toLowerCase().includes(q) && !a.userId?.email?.toLowerCase().includes(q)) return false;
    if (deptFilter && a.userId?.department !== deptFilter) return false;
    if (dateFrom && (a.date ?? "") < dateFrom) return false;
    if (dateTo && (a.date ?? "") > dateTo) return false;
    if (sessionFilter && a.session !== sessionFilter) return false;
    return true;
  }), [appeals, statusTab, search, deptFilter, dateFrom, dateTo, sessionFilter]);

  const counts = { pending: appeals.filter(a => a.status === "pending").length, approved: appeals.filter(a => a.status === "approved").length, rejected: appeals.filter(a => a.status === "rejected").length };
  const hasFilters = search || deptFilter || dateFrom || dateTo || sessionFilter;

  const selectablePendingIds = useMemo(() => filtered.filter(a => a.status === "pending").map(a => a._id), [filtered]);
  const allSelected = selectablePendingIds.length > 0 && selectablePendingIds.every(id => selectedIds.has(id));
  const someSelected = selectablePendingIds.some(id => selectedIds.has(id));

  function toggleAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) selectablePendingIds.forEach(id => next.delete(id));
      else selectablePendingIds.forEach(id => next.add(id));
      return next;
    });
  }
  function toggleOne(id) { setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function clearSel() { setSelectedIds(new Set()); setBulkError(null); }
  function switchTab(k) { setStatusTab(k); clearSel(); }
  function clearFilters() { setSearch(""); setDeptFilter(""); setDateFrom(""); setDateTo(""); setSessionFilter(""); }

  async function executeBulk(action, times) {
    setBulkProcessing(true); setBulkError(null);
    const ids = [...selectedIds];
    try {
      await Promise.all(ids.map(id => {
        const appeal = filtered.find(a => a._id === id);
        const payload = action === "revalidate"
          ? { status: "approved", requiresRevalidation: true, appealDate: appeal?.date, appealStartTime: times.startTime, appealEndTime: times.endTime }
          : { status: action };
        return api.put(`/appeals/${id}/status`, payload);
      }));
      setBulkConfirm(null); clearSel(); fetchAppeals();
    } catch (err) { setBulkError(err.response?.data?.message || "One or more updates failed."); }
    finally { setBulkProcessing(false); }
  }

  return (
    <PageWrapper title="Attendance Appeals" description="Review and action employee attendance cutoff appeals.">
      {selectedAppeal && <AppealActionModal appeal={selectedAppeal} onClose={() => setSelectedAppeal(null)} onDone={() => { setSelectedAppeal(null); fetchAppeals(); }} />}
      {bulkConfirm && <BulkConfirmModal confirm={bulkConfirm} count={selectedIds.size} processing={bulkProcessing} error={bulkError} onExecute={times => executeBulk(bulkConfirm.action, times)} onClose={() => { setBulkConfirm(null); setBulkError(null); }} />}

      <div className="space-y-5">
        {/* Filters */}
        <div className="card py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 16.65a7.5 7.5 0 0012.15 0z" /></svg>
              <input type="text" className="input-field pl-10" placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="input-field w-auto" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="">All departments</option>
              {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="input-field w-auto" value={sessionFilter} onChange={e => setSessionFilter(e.target.value)}>
              <option value="">All sessions</option>
              <option value="morning">Work Start (Morning)</option>
              <option value="evening">Work End (Evening)</option>
            </select>
            <div className="flex items-center gap-2">
              <input type="date" className="input-field w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <span className="text-xs text-slate-400">to</span>
              <input type="date" className="input-field w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            {hasFilters && <button onClick={clearFilters} className="btn-secondary text-sm">Clear</button>}
          </div>
        </div>

        {/* Tabs + List */}
        <div className="card overflow-hidden p-0">
          <div className="flex border-b border-slate-100">
            {[{ key: "pending", label: "Pending", color: "amber" }, { key: "approved", label: "Approved", color: "emerald" }, { key: "rejected", label: "Rejected", color: "rose" }].map(({ key, label, color }) => {
              const active = statusTab === key;
              return (
                <button key={key} onClick={() => switchTab(key)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${active ? `border-${color}-500 text-${color}-700` : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                  {label}
                  <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-bold ${active ? `bg-${color}-100 text-${color}-700` : "bg-slate-100 text-slate-500"}`}>{counts[key]}</span>
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-3 pr-4">
              {statusTab === "pending" && selectablePendingIds.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-slate-800" checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }} onChange={toggleAll} />
                  <span className="text-xs text-slate-500">Select all</span>
                </label>
              )}
              <span className="text-xs text-slate-400">{filtered.length} {filtered.length === 1 ? "record" : "records"}{hasFilters && " (filtered)"}</span>
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between gap-4 border-b border-amber-100 bg-amber-50 px-6 py-3">
              <p className="text-sm font-medium text-amber-900"><span className="font-bold">{selectedIds.size}</span> selected</p>
              <div className="flex gap-2">
                <button onClick={() => { setBulkError(null); setBulkConfirm({ action: "approved" }); }} className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Approve All</button>
                <button onClick={() => { setBulkError(null); setBulkConfirm({ action: "revalidate" }); }} className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">Re-validate All</button>
                <button onClick={() => { setBulkError(null); setBulkConfirm({ action: "rejected" }); }} className="rounded-xl bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-700">Reject All</button>
                <button onClick={clearSel} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Clear</button>
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="flex items-start gap-4 px-6 py-5">
                  <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200 flex-shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3.5 w-40 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-56 animate-pulse rounded bg-slate-200" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-slate-500">No {statusTab} appeals found.</p>
                {hasFilters && <button onClick={clearFilters} className="mt-3 text-sm font-semibold text-blue-600 hover:underline">Clear filters</button>}
              </div>
            ) : filtered.map(appeal => {
              const isPending = appeal.status === "pending";
              const isChecked = selectedIds.has(appeal._id);
              return (
                <div key={appeal._id} className={`flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-start sm:justify-between transition-colors ${isChecked ? "bg-amber-50/60" : "hover:bg-slate-50"}`}>
                  <div className="flex items-start gap-3 min-w-0">
                    {isPending && <input type="checkbox" className="mt-1 h-4 w-4 flex-shrink-0 rounded border-slate-300 accent-slate-800 cursor-pointer" checked={isChecked} onChange={() => toggleOne(appeal._id)} />}
                    <Avatar user={appeal.userId} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-sm text-slate-900">{appeal.userId?.name ?? "Deleted User"}</p>
                        {appeal.userId?.department && <span className="status-chip bg-slate-100 text-slate-600">{appeal.userId.department}</span>}
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${appeal.session === "evening" ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                          {appeal.session === "evening" ? "Work End" : "Work Start"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{appeal.userId?.email ?? "—"}</p>
                      <p className="mt-2 text-xs text-slate-600"><span className="font-medium">Appeal date:</span> {formatDate(appeal.date)}</p>
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2"><span className="font-medium text-slate-600">Reason:</span> {appeal.reason}</p>
                      {appeal.adminResponse && <p className="mt-1 text-xs text-slate-400 italic">Admin: {appeal.adminResponse}</p>}
                      {appeal.requiresRevalidation && (
                        <div className="mt-2 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
                          Re-validate on <strong>{formatDate(appeal.appealDate)}</strong> between <strong>{format12Hour(appeal.appealStartTime)}</strong> and <strong>{format12Hour(appeal.appealEndTime)}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-2 flex-shrink-0">
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge status={appeal.status} />
                      {appeal.requiresRevalidation && <RevalidationBadge status={appeal.revalidationStatus} />}
                    </div>
                    {isPending && (
                      <button onClick={() => setSelectedAppeal(appeal)}
                        className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors">
                        Review
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
