import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";
import { leaveDocUrl } from "../utils/fileUrl";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

/** Returns YYYY-MM-DD for tomorrow in local time (earliest valid leave date). */
function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Document Badge ───────────────────────────────────────────────────────────

function DocBadge({ leaveId, doc }) {
  if (!doc?.fileId) return null;
  const href = leaveDocUrl(leaveId);
  const isPdf = doc.mimeType === "application/pdf";
  const isImage = doc.mimeType?.startsWith("image/");
  const icon = isPdf ? "📄" : isImage ? "🖼️" : "📎";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
      title={`View: ${doc.originalName}`}
    >
      <span>{icon}</span>
      <span className="max-w-[120px] truncate">{doc.originalName}</span>
      {doc.size && <span className="text-blue-400">· {formatBytes(doc.size)}</span>}
    </a>
  );
}

// ─── Status Tab Button ────────────────────────────────────────────────────────

function TabButton({ label, count, active, onClick, color }) {
  const colors = {
    amber:   { active: "border-amber-500 text-amber-700 bg-amber-50",     dot: "bg-amber-400",   badge: "bg-amber-100 text-amber-700" },
    emerald: { active: "border-emerald-500 text-emerald-700 bg-emerald-50", dot: "bg-emerald-400", badge: "bg-emerald-100 text-emerald-700" },
    rose:    { active: "border-rose-500 text-rose-700 bg-rose-50",         dot: "bg-rose-400",    badge: "bg-rose-100 text-rose-700" },
  };
  const c = colors[color];
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${active ? c.active : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
    >
      <span className={`h-2 w-2 rounded-full ${active ? c.dot : "bg-slate-300"}`} />
      {label}
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? c.badge : "bg-slate-100 text-slate-400"}`}>
        {count}
      </span>
    </button>
  );
}

// ─── Leave Card ───────────────────────────────────────────────────────────────

function LeaveCard({ leave }) {
  return (
    <tr className="transition-colors hover:bg-slate-50">
      {/* Date */}
      <td className="px-6 py-3.5 font-medium text-slate-900 whitespace-nowrap">
        {formatDate(leave.date)}
      </td>

      {/* Reason + document */}
      <td className="px-4 py-3.5 text-sm text-slate-600 max-w-xs">
        <p className="line-clamp-2">{leave.reason}</p>
        {leave.supportingDocument?.fileId && (
          <div className="mt-1.5">
            <DocBadge leaveId={leave._id} doc={leave.supportingDocument} />
          </div>
        )}
      </td>

      {/* Type */}
      <td className="px-4 py-3.5">
        {leave.type === "half_day" ? (
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">Half Day</span>
            {leave.halfDaySession && (
              <span className="inline-flex items-center rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-0.5 text-xs text-violet-500">
                {leave.halfDaySession === "morning" ? "Morning leave" : "Evening leave"}
              </span>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">Full Day</span>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3.5">
        {leave.status === "approved" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Approved
          </span>
        )}
        {(leave.status === "rejected" || leave.status === "rejected_hod") && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            {leave.status === "rejected_hod" ? "Rejected by HOD" : "Rejected"}
          </span>
        )}
        {leave.status === "pending_hod" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Pending HOD Review
          </span>
        )}
        {leave.status === "pending_principal" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Pending Principal Review
          </span>
        )}
        {leave.status === "approved_hod" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            HOD Approved — Awaiting Principal
          </span>
        )}
      </td>

      {/* Admin note */}
      <td className="px-4 py-3.5 text-sm text-slate-500 max-w-xs">
        {leave.adminResponse ? <p className="line-clamp-2">{leave.adminResponse}</p> : <span className="text-slate-300">—</span>}
      </td>

      {/* Action Required */}
      <td className="px-4 py-3.5">
        {leave.status === "rejected" ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            Mark both sessions
          </span>
        ) : leave.type === "half_day" && leave.status === "approved" ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
            {leave.halfDaySession === "morning" ? "Mark Work End attendance" : "Mark Work Start attendance"}
          </span>
        ) : (
          <span className="text-slate-300">-</span>
        )}
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeaveManagementPage() {
  const tomorrow = getTomorrow();
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ date: tomorrow, reason: "", type: "full_day", halfDaySession: "morning" });
  const [docFile, setDocFile] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");
  const fileInputRef = useRef(null);

  useEffect(() => { fetchLeaves(); }, []);

  async function fetchLeaves() {
    try {
      const res = await api.get("/leaves/my");
      setLeaves(res.data);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0] || null;
    setDocFile(file);
  }

  function clearFile() {
    setDocFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = new FormData();
      payload.append("date", formData.date);
      payload.append("reason", formData.reason);
      payload.append("type", formData.type);
      if (formData.type === "half_day") payload.append("halfDaySession", formData.halfDaySession);
      if (docFile) payload.append("supportingDocument", docFile);

      await api.post("/leaves", payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSuccess("Leave request submitted successfully.");
      setFormData({ date: "", reason: "", type: "full_day", halfDaySession: "morning" });
      clearFile();
      fetchLeaves();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit leave request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const pending  = useMemo(() => leaves.filter((l) => ["pending_hod", "pending_principal", "approved_hod"].includes(l.status)), [leaves]);
  const approved = useMemo(() => leaves.filter((l) => l.status === "approved"), [leaves]);
  const rejected = useMemo(() => leaves.filter((l) => ["rejected", "rejected_hod"].includes(l.status)), [leaves]);

  const tabData = { pending, approved, rejected };
  const visibleLeaves = tabData[activeTab] ?? [];

  return (
    <PageWrapper
      title="Leave Management"
      description="Apply for leaves and track the status of your existing requests."
    >
      <div className="space-y-5">

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card py-4"><p className="section-label">Pending</p><p className="metric-value mt-3">{pending.length}</p></div>
          <div className="card py-4"><p className="section-label">Approved</p><p className="metric-value mt-3">{approved.length}</p></div>
          <div className="card py-4"><p className="section-label">Rejected</p><p className="metric-value mt-3">{rejected.length}</p></div>
        </div>

        {/* ── Apply form ── */}
        <div className="card overflow-hidden p-0">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="section-label">New Request</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Apply for Leave</h2>
          </div>

          <div className="px-6 py-5">
            {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
            {success && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

            <form onSubmit={handleSubmit}>
              {/* Leave Type Toggle */}
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Leave Type</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setFormData({ ...formData, type: "full_day", halfDaySession: "morning" })}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${formData.type === "full_day" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
                    Full Day
                  </button>
                  <button type="button" onClick={() => setFormData({ ...formData, type: "half_day", halfDaySession: "morning" })}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${formData.type === "half_day" ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
                    Half Day
                  </button>
                </div>

                {formData.type === "half_day" && (
                  <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 space-y-2">
                    <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Which session is leave?</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setFormData({ ...formData, halfDaySession: "morning" })}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${formData.halfDaySession === "morning" ? "border-violet-500 bg-violet-600 text-white" : "border-violet-200 bg-white text-violet-600 hover:bg-violet-100"}`}>
                        Morning (Work Start)
                      </button>
                      <button type="button" onClick={() => setFormData({ ...formData, halfDaySession: "evening" })}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${formData.halfDaySession === "evening" ? "border-violet-500 bg-violet-600 text-white" : "border-violet-200 bg-white text-violet-600 hover:bg-violet-100"}`}>
                        Evening (Work End)
                      </button>
                    </div>
                    <p className="text-xs text-violet-600 leading-relaxed">
                      {formData.halfDaySession === "morning"
                        ? "Work Start session will be waived. You must still mark Work End attendance on that day."
                        : "Work End session will be waived. You must still mark Work Start attendance on that day."}
                    </p>
                  </div>
                )}
              </div>

              {/* Date + Reason row */}
              <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
                  <input type="date" required min={tomorrow} value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Reason</label>
                  <input type="text" required value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    className="input-field" placeholder="Explain your reason for leave…" />
                </div>
              </div>

              {/* Supporting document upload */}
              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Supporting Document
                  <span className="ml-1.5 font-normal text-slate-400">(optional — PDF, image, or Word, max 5 MB)</span>
                </label>

                {docFile ? (
                  <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                    <svg className="h-5 w-5 flex-shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-blue-800">{docFile.name}</p>
                      <p className="text-xs text-blue-500">{formatBytes(docFile.size)}</p>
                    </div>
                    <button type="button" onClick={clearFile}
                      className="rounded-lg p-1 text-blue-400 hover:bg-blue-100 hover:text-blue-700 transition-colors">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload a supporting document
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              <div className="mt-5 flex justify-end">
                <button type="submit" disabled={isSubmitting} className="btn-primary disabled:opacity-50 whitespace-nowrap">
                  {isSubmitting ? "Submitting…" : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── Leave requests table ── */}
        <div className="card overflow-hidden p-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div>
              <p className="section-label">My Requests</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Leave history</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">{leaves.length} total</p>
          </div>

          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-3">
            <div className="flex flex-wrap gap-2">
              <TabButton label="Pending"  count={pending.length}  active={activeTab === "pending"}  onClick={() => setActiveTab("pending")}  color="amber" />
              <TabButton label="Approved" count={approved.length} active={activeTab === "approved"} onClick={() => setActiveTab("approved")} color="emerald" />
              <TabButton label="Rejected" count={rejected.length} active={activeTab === "rejected"} onClick={() => setActiveTab("rejected")} color="rose" />
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="divide-y divide-slate-100">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <div className="h-3.5 w-32 animate-pulse rounded bg-slate-200" />
                    <div className="flex-1 h-3 w-48 animate-pulse rounded bg-slate-200" />
                    <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : visibleLeaves.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-slate-500">No {activeTab} leave requests.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Reason / Document</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Admin Note</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Action Required</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleLeaves.map((leave) => <LeaveCard key={leave._id} leave={leave} />)}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </PageWrapper>
  );
}