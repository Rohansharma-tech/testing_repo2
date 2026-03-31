import { useEffect, useState } from "react";
import api from "../api/axios";
import { AttendanceReasonBadge, AttendanceStatusBadge } from "../components/AttendanceBadges";
import PageWrapper from "../components/PageWrapper";
import { useAuth } from "../context/AuthContext";
import { ATTENDANCE_STATUS, formatTime12h } from "../utils/attendance";

// ─── User Avatar ──────────────────────────────────────────────────────────────

function UserAvatar({ user, size = "md" }) {
  const sizeClasses = { sm: "h-8 w-8 text-xs", md: "h-9 w-9 text-sm" };
  const base = `${sizeClasses[size]} flex-shrink-0 rounded-full object-cover`;

  const initials = user?.name
    ? user.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "?";

  const src = user?.profileImageUrl || (user?.profileImage ? `/${user.profileImage}` : null);
  const [broken, setBroken] = useState(false);

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={user?.name ?? "Profile"}
        className={`${base} border border-slate-200`}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div className={`${base} flex items-center justify-center bg-blue-600 font-semibold text-white`}>
      {initials}
    </div>
  );
}

function formatFriendlyDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Appeal Reason Modal ──────────────────────────────────────────────────────

function AppealModal({ date, onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) { setError("Please enter a reason."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(date, trimmed);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to submit appeal.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <div>
            <p className="section-label">Appeal Cutoff Absence</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Submit Appeal</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-500">
            Appealing auto-absent mark for{" "}
            <strong className="text-slate-700">{formatFriendlyDate(date)}</strong>.
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Reason for appeal
            </label>
            <textarea
              className="input-field resize-none"
              rows={4}
              placeholder="Explain why you were unable to mark attendance..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? "Submitting…" : "Submit Appeal"}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Appeal Status Cell ───────────────────────────────────────────────────────

function AppealCell({ record, appeal, onAppeal }) {
  const status = appeal?.status ?? null;

  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Pending
      </span>
    );
  }

  if (status === "approved") {
    if (appeal.requiresRevalidation) {
      const rv = appeal.revalidationStatus;
      if (rv === "missed") {
        return (
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Approved</span>
            <span className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">Missed Re-validation</span>
          </div>
        );
      }
      if (rv === "completed") {
        return (
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Approved</span>
            <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              Re-validated
            </span>
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Approved</span>
          <span className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            Re-validation: {formatTime12h(appeal.appealStartTime)}–{formatTime12h(appeal.appealEndTime)}
          </span>
        </div>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        Approved
      </span>
    );
  }

  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        Rejected
      </span>
    );
  }

  return (
    <button
      onClick={() => onAppeal(record.date)}
      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-800"
    >
      Appeal
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MyAttendancePage() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0 });
  const [appealModalDate, setAppealModalDate] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    async function fetchHistory() {
      try {
        const [attendanceRes, appealsRes] = await Promise.all([
          api.get("/attendance/my"),
          api.get("/appeals/my"),
        ]);
        setRecords(attendanceRes.data);
        setAppeals(appealsRes.data);
        setStats({
          total: attendanceRes.data.length,
          present: attendanceRes.data.filter((r) => r.status === ATTENDANCE_STATUS.PRESENT).length,
          absent: attendanceRes.data.filter((r) => r.status === ATTENDANCE_STATUS.ABSENT).length,
        });
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  const appealsByDate = Object.fromEntries(appeals.map((a) => [a.date, a]));

  async function handleAppealConfirm(date, reason) {
    await api.post("/appeals", { date, reason });
    const res = await api.get("/appeals/my");
    setAppeals(res.data);
  }

  // Apply filters
  const filteredRecords = records.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (dateFrom && r.date < dateFrom) return false;
    if (dateTo && r.date > dateTo) return false;
    return true;
  });

  const hasFilters = statusFilter || dateFrom || dateTo;

  return (
    <PageWrapper
      title="Attendance History"
      description="Review your recent attendance entries with present, absent, and outside-location outcomes."
    >
      {appealModalDate && (
        <AppealModal
          date={appealModalDate}
          onConfirm={handleAppealConfirm}
          onClose={() => setAppealModalDate(null)}
        />
      )}

      <div className="space-y-5">

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card py-4">
            <p className="section-label">Total Records</p>
            <p className="metric-value mt-3">{stats.total}</p>
          </div>
          <div className="card py-4">
            <p className="section-label">Present</p>
            <p className="metric-value mt-3">{stats.present}</p>
          </div>
          <div className="card py-4">
            <p className="section-label">Absent</p>
            <p className="metric-value mt-3">{stats.absent}</p>
          </div>
        </div>

        {/* ── Records table ── */}
        <div className="card overflow-hidden p-0">

          {/* Card header */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div>
              <p className="section-label">Timeline</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Recent entries</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">Latest 30 records</p>
          </div>

          {/* Control bar */}
          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-3">
            <div className="flex flex-wrap items-center gap-3">

              {/* Status filter */}
              <select
                className="input-field w-auto"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value={ATTENDANCE_STATUS.PRESENT}>Present</option>
                <option value={ATTENDANCE_STATUS.ABSENT}>Absent</option>
                <option value="leave">Leave</option>
                <option value={ATTENDANCE_STATUS.NOT_MARKED}>Not Marked</option>
              </select>

              {/* Date range */}
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="input-field w-auto"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  title="From date"
                />
                <span className="text-xs text-slate-400 flex-shrink-0">to</span>
                <input
                  type="date"
                  className="input-field w-auto"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  title="To date"
                />
              </div>

              {/* Clear */}
              {hasFilters && (
                <button
                  onClick={() => { setStatusFilter(""); setDateFrom(""); setDateTo(""); }}
                  className="btn-secondary text-sm"
                >
                  Clear
                </button>
              )}

              <p className="ml-auto flex-shrink-0 text-sm text-slate-500">
                {filteredRecords.length} {filteredRecords.length === 1 ? "record" : "records"}
                {hasFilters && (
                  <span className="text-slate-400"> (filtered from {records.length})</span>
                )}
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="divide-y divide-slate-100">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-36 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                    </div>
                    <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-medium text-slate-500">
                  {hasFilters ? "No records match the current filters." : "No attendance records are available yet."}
                </p>
                {hasFilters && (
                  <button
                    onClick={() => { setStatusFilter(""); setDateFrom(""); setDateTo(""); }}
                    className="mt-3 text-sm font-semibold text-blue-600 hover:underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Flags</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Location</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Appeal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.map((record) => {
                    const appeal = appealsByDate[record.date] ?? null;
                    const isAutoCutoff =
                      record.status === "absent" &&
                      (record.source === "cutoff" ||
                        record.source === "auto_cutoff" ||
                        record.reason === "auto_absent");

                    const showAppealValidated =
                      record.status === "present" &&
                      (record.source === "appeal" || record.source === "appeal_approval");

                    return (
                      <tr key={record.id} className="transition-colors hover:bg-slate-50">

                        {/* Date + avatar */}
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <UserAvatar user={user} size="md" />
                            <span className="font-medium text-slate-900">
                              {formatFriendlyDate(record.date)}
                            </span>
                          </div>
                        </td>

                        {/* Time */}
                        <td className="px-4 py-3.5 text-xs text-slate-500">
                          {record.time ? formatTime12h(record.time) : <span className="text-slate-300">—</span>}
                        </td>

                        {/* Status + reason */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1.5">
                            <AttendanceStatusBadge status={record.status} />
                            <AttendanceReasonBadge reason={record.reason} />
                          </div>
                        </td>

                        {/* Flags: auto cutoff, appeal validated, penalty */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-1">
                            {showAppealValidated && (
                              <span className="inline-flex items-center rounded-lg border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-800">
                                Appeal Validated
                              </span>
                            )}
                            {record.autoMarked && record.source === "auto_cutoff" && (
                              <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                Auto Cutoff
                              </span>
                            )}
                            {record.penalty && (
                              <span className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-800">
                                Penalty
                              </span>
                            )}
                            {!showAppealValidated && !record.autoMarked && !record.penalty && (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </div>
                        </td>

                        {/* Location */}
                        <td className="px-4 py-3.5 text-xs text-slate-500">
                          {record.distanceMeters != null ? (
                            <span>{record.distanceMeters} m</span>
                          ) : record.latitude != null ? (
                            <span>{record.latitude.toFixed(4)}, {record.longitude.toFixed(4)}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>

                        {/* Appeal */}
                        <td className="px-4 py-3.5">
                          {isAutoCutoff ? (
                            <AppealCell
                              record={record}
                              appeal={appeal}
                              onAppeal={setAppealModalDate}
                            />
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
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