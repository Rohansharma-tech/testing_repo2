import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";

function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

// ─── Status Tab Button ────────────────────────────────────────────────────────

function TabButton({ label, count, active, onClick, color }) {
  const colors = {
    amber:   { active: "border-amber-500 text-amber-700 bg-amber-50",   dot: "bg-amber-400",   badge: "bg-amber-100 text-amber-700" },
    emerald: { active: "border-emerald-500 text-emerald-700 bg-emerald-50", dot: "bg-emerald-400", badge: "bg-emerald-100 text-emerald-700" },
    rose:    { active: "border-rose-500 text-rose-700 bg-rose-50",       dot: "bg-rose-400",    badge: "bg-rose-100 text-rose-700" },
  };
  const c = colors[color];
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
        active ? c.active : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      }`}
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

      {/* Reason */}
      <td className="px-4 py-3.5 text-sm text-slate-600 max-w-xs">
        <p className="line-clamp-2">{leave.reason}</p>
      </td>

      {/* Status */}
      <td className="px-4 py-3.5">
        {leave.status === "approved" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Approved
          </span>
        )}
        {leave.status === "rejected" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            Rejected
          </span>
        )}
        {leave.status === "pending" && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Pending
          </span>
        )}
      </td>

      {/* Admin note */}
      <td className="px-4 py-3.5 text-sm text-slate-500 max-w-xs">
        {leave.adminResponse ? (
          <p className="line-clamp-2">{leave.adminResponse}</p>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>

      {/* Type badge */}
      <td className="px-4 py-3.5">
        {leave.type === "half_day" ? (
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
              Half Day
            </span>
            {leave.halfDaySession && (
              <span className="inline-flex items-center rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-0.5 text-xs text-violet-500">
                {leave.halfDaySession === "morning" ? "Morning leave" : "Evening leave"}
              </span>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500">
            Full Day
          </span>
        )}
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
            {leave.halfDaySession === "morning"
              ? "Mark Work End attendance"
              : "Mark Work Start attendance"}
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
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ date: "", reason: "", type: "full_day", halfDaySession: "morning" });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState("pending");

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

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      // Only send halfDaySession when type is half_day
      const payload = formData.type === "half_day"
        ? formData
        : { date: formData.date, reason: formData.reason, type: formData.type };
      await api.post("/leaves", payload);
      setSuccess("Leave request submitted successfully.");
      setFormData({ date: "", reason: "", type: "full_day", halfDaySession: "morning" });
      fetchLeaves();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit leave request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const pending  = useMemo(() => leaves.filter((l) => l.status === "pending"),  [leaves]);
  const approved = useMemo(() => leaves.filter((l) => l.status === "approved"), [leaves]);
  const rejected = useMemo(() => leaves.filter((l) => l.status === "rejected"), [leaves]);

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
          <div className="card py-4">
            <p className="section-label">Pending</p>
            <p className="metric-value mt-3">{pending.length}</p>
          </div>
          <div className="card py-4">
            <p className="section-label">Approved</p>
            <p className="metric-value mt-3">{approved.length}</p>
          </div>
          <div className="card py-4">
            <p className="section-label">Rejected</p>
            <p className="metric-value mt-3">{rejected.length}</p>
          </div>
        </div>

        {/* ── Apply form ── */}
        <div className="card overflow-hidden p-0">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="section-label">New Request</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Apply for Leave</h2>
          </div>

          <div className="px-6 py-5">
            {error && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Leave Type Toggle */}
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Leave Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: "full_day", halfDaySession: "morning" })}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                      formData.type === "full_day"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    Full Day
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: "half_day", halfDaySession: "morning" })}
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                      formData.type === "half_day"
                        ? "border-violet-500 bg-violet-50 text-violet-700"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    Half Day
                  </button>
                </div>

                {/* Session selector — only shown for half-day */}
                {formData.type === "half_day" && (
                  <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 space-y-2">
                    <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Which session is leave?</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, halfDaySession: "morning" })}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                          formData.halfDaySession === "morning"
                            ? "border-violet-500 bg-violet-600 text-white"
                            : "border-violet-200 bg-white text-violet-600 hover:bg-violet-100"
                        }`}
                      >
                        Morning (Work Start)
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, halfDaySession: "evening" })}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                          formData.halfDaySession === "evening"
                            ? "border-violet-500 bg-violet-600 text-white"
                            : "border-violet-200 bg-white text-violet-600 hover:bg-violet-100"
                        }`}
                      >
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

              <div className="grid gap-4 sm:grid-cols-[1fr_2fr_auto] items-end">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Reason</label>
                  <input
                    type="text"
                    required
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    className="input-field"
                    placeholder="Explain your reason for leave…"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary disabled:opacity-50 whitespace-nowrap"
                >
                  {isSubmitting ? "Submitting…" : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── Leave requests table ── */}
        <div className="card overflow-hidden p-0">

          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div>
              <p className="section-label">My Requests</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Leave history</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">{leaves.length} total</p>
          </div>

          {/* Tab bar */}
          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-3">
            <div className="flex flex-wrap gap-2">
              <TabButton label="Pending"  count={pending.length}  active={activeTab === "pending"}  onClick={() => setActiveTab("pending")}  color="amber"   />
              <TabButton label="Approved" count={approved.length} active={activeTab === "approved"} onClick={() => setActiveTab("approved")} color="emerald" />
              <TabButton label="Rejected" count={rejected.length} active={activeTab === "rejected"} onClick={() => setActiveTab("rejected")} color="rose"    />
            </div>
          </div>

          {/* Table */}
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
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                No {activeTab} leave requests.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Admin Note</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Action Required</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleLeaves.map((leave) => (
                    <LeaveCard key={leave._id} leave={leave} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </PageWrapper>
  );
}