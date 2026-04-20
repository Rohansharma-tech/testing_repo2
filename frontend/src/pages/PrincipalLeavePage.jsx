// src/pages/PrincipalLeavePage.jsx
// Principal's dashboard for final-stage leave approval.

import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";
import { useToast } from "../components/Toast";
import { leaveDocUrl } from "../utils/fileUrl";


function DocBadge({ leaveId, doc }) {
  if (!doc?.fileId) return null;
  const href = leaveDocUrl(leaveId);
  const isPdf = doc.mimeType === "application/pdf";
  const isImage = doc.mimeType?.startsWith("image/");
  const icon = isPdf ? "📄" : isImage ? "🖼️" : "📎";
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
      title={`View: ${doc.originalName}`}>
      <span>{icon}</span>
      <span className="max-w-[160px] truncate">{doc.originalName}</span>
    </a>
  );
}

function formatDate(s) {
  if (!s) return "—";
  return new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }) {
  const map = {
    approved_hod:      "bg-blue-50 text-blue-700 border-blue-200",
    pending_principal: "bg-violet-50 text-violet-700 border-violet-200",
    approved:          "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected:          "bg-rose-50 text-rose-700 border-rose-200",
  };
  const labels = {
    approved_hod:      "Awaiting Decision",
    pending_principal: "HOD Leave — Awaiting Decision",
    approved:          "Approved",
    rejected:          "Rejected",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${map[status] ?? "bg-slate-100 text-slate-600"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function TypeBadge({ type, halfDaySession }) {
  if (type === "half_day") {
    return (
      <div className="flex flex-col gap-1">
        <span className="status-chip bg-violet-50 text-violet-700">Half Day</span>
        {halfDaySession && <span className="text-xs text-violet-500">{halfDaySession === "morning" ? "Morning leave" : "Evening leave"}</span>}
      </div>
    );
  }
  return <span className="status-chip bg-slate-100 text-slate-600">Full Day</span>;
}

function ActionModal({ leave, onClose, onDone }) {
  const [action, setAction] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const u = leave.userId;
  const name = u?.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : (u?.name ?? "Employee");

  async function submit() {
    if (!action) return;
    setError(null); setSaving(true);
    try {
      await api.put(`/leaves/${leave._id}/principal-action`, { action, remarks });
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to process leave.");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 pb-4 pt-6">
          <div>
            <p className="section-label">Principal Review</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{name}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{u?.email} · {u?.department} · {formatDate(leave.date)}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* HOD bypass note OR HOD remarks */}
        {leave.status === "pending_principal" ? (
          <div className="border-b border-violet-100 bg-violet-50 px-6 py-3">
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-violet-700">HOD Leave — Direct to Principal</p>
            <p className="text-sm text-violet-800">This is a HOD's own leave request. It bypasses the HOD approval stage and goes directly to you.</p>
          </div>
        ) : leave.hodApproval?.remarks ? (
          <div className="border-b border-blue-100 bg-blue-50 px-6 py-3">
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-blue-700">HOD Remarks</p>
            <p className="text-sm text-blue-800">{leave.hodApproval.remarks}</p>
          </div>
        ) : null}

        <div className="border-b border-slate-100 bg-slate-50 px-6 py-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Employee's Reason</p>
          <p className="text-sm leading-relaxed text-slate-700">{leave.reason}</p>
          {leave.supportingDocument?.fileId && (
            <div className="mt-2">
              <DocBadge leaveId={leave._id} doc={leave.supportingDocument} />
            </div>
          )}
        </div>

        <div className="space-y-4 px-6 py-5">
          {!action ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">Final decision:</p>
              <button onClick={() => setAction("approved")} className="flex w-full items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left hover:bg-emerald-100 transition-colors">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs">✓</span>
                <div><p className="text-sm font-semibold text-emerald-800">Approve — Grant Leave</p><p className="text-xs text-emerald-600 mt-0.5">Attendance will be automatically marked as leave for this date.</p></div>
              </button>
              <button onClick={() => setAction("rejected")} className="flex w-full items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left hover:bg-rose-100 transition-colors">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white text-xs">✕</span>
                <div><p className="text-sm font-semibold text-rose-800">Reject — Deny Leave</p><p className="text-xs text-rose-600 mt-0.5">Employee must mark attendance manually or will be absent.</p></div>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={() => { setAction(null); setError(null); }} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>Back
                </button>
                <span className="text-slate-300">/</span>
                <p className="text-sm font-semibold text-slate-700">{action === "approved" ? "Grant Leave" : "Reject Leave"}</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Remarks <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea className="input-field resize-none" rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder={action === "rejected" ? "Reason for rejection..." : "Note for employee..."} />
              </div>
              {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</p>}
              <div className="flex items-center gap-3">
                <button onClick={submit} disabled={saving} className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${action === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>
                  {saving ? "Processing…" : action === "approved" ? "Grant Leave" : "Reject Leave"}
                </button>
                <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STATUS_TABS = [
  { key: "pending",  label: "Pending",  color: "blue",    statuses: ["approved_hod", "pending_principal"] },
  { key: "approved", label: "Approved", color: "emerald", statuses: ["approved"] },
  { key: "rejected", label: "Rejected", color: "rose",    statuses: ["rejected"] },
];

export default function PrincipalLeavePage() {
  const { showToast, ToastContainer } = useToast();
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pending");

  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");

  const fetchLeaves = async () => {
    try {
      const res = await api.get("/leaves/principal");
      setLeaves(res.data);
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to load leaves.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeaves(); }, []);

  const allDepts = useMemo(() => [...new Set(leaves.map(l => l.userId?.department).filter(Boolean))].sort(), [leaves]);

  const counts = useMemo(() => {
    const c = {};
    STATUS_TABS.forEach(({ key, statuses }) => {
      c[key] = leaves.filter(l => statuses.includes(l.status)).length;
    });
    return c;
  }, [leaves]);

  const visible = useMemo(() => {
    const tabDef = STATUS_TABS.find(t => t.key === tab);
    let r = leaves.filter(l => tabDef?.statuses.includes(l.status));
    const q = search.trim().toLowerCase();
    if (q) r = r.filter(l => {
      const u = l.userId;
      const name = u?.firstName ? `${u.firstName} ${u.lastName || ""}`.toLowerCase() : (u?.name ?? "").toLowerCase();
      return name.includes(q) || (u?.email ?? "").toLowerCase().includes(q);
    });
    if (deptFilter) r = r.filter(l => l.userId?.department === deptFilter);
    return r;
  }, [leaves, tab, search, deptFilter]);

  return (
    <PageWrapper title="Leave Approvals" description="Final approval stage for leave requests approved by HODs. Your decision is binding.">
      <ToastContainer />
      {selected && (
        <ActionModal
          leave={selected}
          onClose={() => setSelected(null)}
          onDone={() => { setSelected(null); fetchLeaves(); showToast("Leave decision recorded.", "success"); }}
        />
      )}

      <div className="space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {STATUS_TABS.map(({ key, label, color }) => (
            <div key={key} className={`card py-4 cursor-pointer transition-all ${tab === key ? `ring-2 ring-${color}-400` : "hover:shadow-md"}`} onClick={() => setTab(key)}>
              <p className="section-label">{label}</p>
              <p className={`metric-value mt-3 text-${color}-600`}>{counts[key] ?? 0}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="card py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
              {STATUS_TABS.map(({ key, label, color }) => (
                <button key={key} onClick={() => setTab(key)} className={`rounded-xl px-3 py-2 text-xs font-medium transition-all ${tab === key ? `bg-white text-${color}-700 shadow-sm` : "text-slate-500 hover:text-slate-700"}`}>
                  {label}
                  {counts[key] > 0 && <span className={`ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-xs font-bold ${tab === key ? `bg-${color}-100 text-${color}-700` : "bg-slate-200 text-slate-600"}`}>{counts[key]}</span>}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[180px]">
              <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 16.65a7.5 7.5 0 0012.15 0z" /></svg>
              <input className="input-field pl-10" placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="input-field w-auto" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="">All departments</option>
              {allDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden p-0">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="section-label">Leave Requests</p>
            <p className="mt-1 text-sm text-slate-500">{visible.length} {visible.length === 1 ? "request" : "requests"}</p>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="divide-y divide-slate-100">
                {[1, 2, 3].map(i => <div key={i} className="flex items-center gap-4 px-6 py-4"><div className="h-9 w-9 animate-pulse rounded-full bg-slate-200" /><div className="flex-1 space-y-2"><div className="h-3.5 w-36 animate-pulse rounded bg-slate-200" /><div className="h-3 w-48 animate-pulse rounded bg-slate-200" /></div></div>)}
              </div>
            ) : visible.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">No leave requests in this category.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Dept</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">HOD Remarks</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map(leave => {
                    const u = leave.userId;
                    const name = u?.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : (u?.name ?? "—");
                    return (
                      <tr key={leave._id} className="transition-colors hover:bg-slate-50">
                        <td className="px-6 py-3.5">
                          <p className="font-medium text-slate-900">{name}</p>
                          <p className="text-xs text-slate-400">{u?.email}</p>
                        </td>
                        <td className="px-4 py-3.5"><span className="status-chip bg-slate-100 text-slate-600">{u?.department ?? "—"}</span></td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">{formatDate(leave.date)}</td>
                        <td className="px-4 py-3.5"><TypeBadge type={leave.type} halfDaySession={leave.halfDaySession} /></td>
                        <td className="px-4 py-3.5 max-w-xs text-slate-600">
                          <p className="line-clamp-2">{leave.reason}</p>
                          {leave.supportingDocument?.fileId && (
                            <div className="mt-1.5"><DocBadge leaveId={leave._id} doc={leave.supportingDocument} /></div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 max-w-xs text-slate-500 text-xs italic">{leave.hodApproval?.remarks || "—"}</td>
                        <td className="px-4 py-3.5"><StatusBadge status={leave.status} /></td>
                        <td className="px-4 py-3.5 text-right">
                          {["approved_hod", "pending_principal"].includes(leave.status) ? (
                            <button onClick={() => setSelected(leave)} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors">
                              Decide
                            </button>
                          ) : <span className="text-xs text-slate-400">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
