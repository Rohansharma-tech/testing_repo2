import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import { AttendanceReasonBadge, AttendanceStatusBadge } from "../components/AttendanceBadges";
import PageWrapper from "../components/PageWrapper";
import { useAuth } from "../context/AuthContext";
import { ATTENDANCE_STATUS, formatTime12h } from "../utils/attendance";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFriendlyDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Returns today's date as YYYY-MM-DD in the browser's local timezone. */
function getTodayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Group flat records into { date → { morning, evening } }
function groupByDate(records) {
  const map = new Map();
  for (const r of records) {
    const d = r.date;
    if (!map.has(d)) map.set(d, { date: d, morning: null, evening: null });
    const session = r.session || "morning";
    map.get(d)[session] = r;
  }
  // newest date first
  return [...map.values()].sort((a, b) => (b.date > a.date ? 1 : -1));
}

// ─── User Avatar ──────────────────────────────────────────────────────────────

function UserAvatar({ user }) {
  const initials = user?.name
    ? user.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "?";
// Resolve Cloudinary URL
  const src = user?.profileImageUrl || user?.profileImage || null;
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt={user?.name ?? "Profile"}
        className="h-10 w-10 flex-shrink-0 rounded-full border border-slate-200 object-cover"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div className="h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center bg-blue-600 text-sm font-semibold text-white">
      {initials}
    </div>
  );
}

// ─── Appeal Reason Modal ──────────────────────────────────────────────────────

function AppealModal({ date, session = "morning", onConfirm, onClose }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const sessionLabel = session === "evening" ? "Work End" : "Work Start";

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) { setError("Please enter a reason."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(date, session, trimmed);
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
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Past-date defensive guard — backend will also reject, but give clear UI feedback */}
        {date !== getTodayLocal() ? (
          <div className="px-6 py-6 space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-sm font-semibold text-amber-800">Appeal window closed</p>
              <p className="mt-1 text-xs text-amber-700">
                Appeals can only be submitted on the same day as the absence.
                The window for <strong>{formatFriendlyDate(date)}</strong> has closed.
              </p>
            </div>
            <button onClick={onClose} className="btn-secondary w-full">Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-500">
              Appealing auto-absent mark for{" "}
              <strong className="text-slate-700">{formatFriendlyDate(date)}</strong>
              {" "}—{" "}
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${
                session === "evening"
                  ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                  : "bg-blue-50 text-blue-700 border border-blue-200"
              }`}>{sessionLabel}</span>
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Reason for appeal</label>
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
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">{error}</p>
            )}
            <div className="flex items-center gap-3 pt-1">
              <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
                {submitting ? "Submitting…" : "Submit Appeal"}
              </button>
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Appeal Status Badge ──────────────────────────────────────────────────────

function AppealBadge({ record, appeal, onAppeal }) {
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
      if (rv === "missed") return (
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Approved</span>
          <span className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">Missed Re-validation</span>
        </div>
      );
      if (rv === "completed") return (
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Approved</span>
          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Re-validated
          </span>
        </div>
      );
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

  const isAutoCutoff =
    record?.status === "absent" &&
    (record?.source === "cutoff" || record?.source === "auto_cutoff" || record?.reason === "auto_absent");

  if (!isAutoCutoff && !appeal) return <span className="text-xs text-slate-300">—</span>;

  const today = getTodayLocal();
  const isToday = record?.date === today;

  // Past-date: show a locked "Closed" badge instead of the Appeal button
  if (isAutoCutoff && !appeal && !isToday) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-400">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Closed
      </span>
    );
  }

  return (
    <button
      onClick={() => onAppeal(record.date, record.session || "morning")}
      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-800"
    >
      Appeal
    </button>
  );
}

// ─── Session Mini-Block ───────────────────────────────────────────────────────

function SessionBlock({ label, accent, record, appeal, onAppeal }) {
  const colors = {
    blue:   { header: "bg-blue-50 border-blue-100 text-blue-700",     border: "border-blue-100" },
    indigo: { header: "bg-indigo-50 border-indigo-100 text-indigo-700", border: "border-indigo-100" },
  };
  const c = colors[accent];

  if (!record) {
    return (
      <div className={`flex-1 min-w-0 rounded-xl border ${c.border} overflow-hidden`}>
        <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${c.header}`}>{label}</div>
        <div className="px-3 py-3 text-xs text-slate-400 italic">No record</div>
      </div>
    );
  }

  const isAutoCutoff =
    record.status === "absent" &&
    (record.source === "cutoff" || record.source === "auto_cutoff" || record.reason === "auto_absent");

  return (
    <div className={`flex-1 min-w-0 rounded-xl border ${c.border} overflow-hidden`}>
      <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${c.header}`}>{label}</div>
      <div className="px-3 py-3 space-y-1.5">
        {/* Status + badges */}
        <div className="flex flex-wrap items-center gap-1">
          <AttendanceStatusBadge status={record.status} />
          <AttendanceReasonBadge reason={record.reason} />
          {record.autoMarked && record.source === "auto_cutoff" && (
            <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">Auto</span>
          )}
          {record.penalty && (
            <span className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-800">Penalty</span>
          )}
        </div>

        {/* Time */}
        <p className="text-xs text-slate-600">
          <span className="text-slate-400">Time: </span>
          {record.time ? formatTime12h(record.time) : <span className="text-slate-300">—</span>}
        </p>

        {/* Location */}
        <p className="text-xs text-slate-500">
          <span className="text-slate-400">Location: </span>
          {record.distanceMeters != null
            ? `${record.distanceMeters} m`
            : record.latitude != null
            ? `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`
            : <span className="text-slate-300">—</span>}
        </p>

        {/* Appeal */}
        {(appeal || isAutoCutoff) && (
          <div className="pt-0.5">
            <AppealBadge
              record={record}
              appeal={appeal}
              onAppeal={onAppeal}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Day Card ─────────────────────────────────────────────────────────────────

function DayCard({ group, user, appealsByKey, onAppeal }) {
  const ms = group.morning?.status;
  const es = group.evening?.status;

  let overallLabel = "Partial";
  let overallClass = "bg-amber-50 text-amber-700 border-amber-200";
  if (ms === "present" && es === "present") { overallLabel = "Full Day Present"; overallClass = "bg-emerald-50 text-emerald-700 border-emerald-200"; }
  else if (ms === "absent" && es === "absent") { overallLabel = "Full Day Absent"; overallClass = "bg-rose-50 text-rose-700 border-rose-200"; }
  else if (ms === "leave"   && es === "leave")  { overallLabel = "On Leave"; overallClass = "bg-blue-50 text-blue-700 border-blue-200"; }
  else if (!group.evening && ms === "present")  { overallLabel = "Present"; overallClass = "bg-emerald-50 text-emerald-700 border-emerald-200"; }
  else if (!group.evening && ms === "absent")   { overallLabel = "Absent"; overallClass = "bg-rose-50 text-rose-700 border-rose-200"; }

  const morningAppeal = appealsByKey[`${group.date}-morning`] ?? null;
  const eveningAppeal = appealsByKey[`${group.date}-evening`] ?? null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <UserAvatar user={user} />
          <div>
            <p className="text-sm font-semibold text-slate-900">{formatFriendlyDate(group.date)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{group.date}</p>
          </div>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${overallClass}`}>
          {overallLabel}
        </span>
      </div>

      {/* Sessions side-by-side */}
      <div className="mt-3 flex gap-3 flex-col sm:flex-row">
        <SessionBlock
          label="Work Start"
          accent="blue"
          record={group.morning}
          appeal={morningAppeal}
          onAppeal={onAppeal}
        />
        <SessionBlock
          label="Work End"
          accent="indigo"
          record={group.evening}
          appeal={eveningAppeal}
          onAppeal={onAppeal}
        />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MyAttendancePage() {
  const { user } = useAuth();
  const [records, setRecords]       = useState([]);
  const [appeals, setAppeals]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [stats, setStats]           = useState({ total: 0, present: 0, absent: 0, morning: 0, evening: 0 });
  const [appealModalInfo, setAppealModalInfo] = useState(null);

  // Filters (applied to flat records before grouping)
  const [statusFilter,  setStatusFilter]  = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [dateFrom,      setDateFrom]      = useState("");
  const [dateTo,        setDateTo]        = useState("");

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
          total:   attendanceRes.data.length,
          present: attendanceRes.data.filter((r) => r.status === ATTENDANCE_STATUS.PRESENT).length,
          absent:  attendanceRes.data.filter((r) => r.status === ATTENDANCE_STATUS.ABSENT).length,
          morning: attendanceRes.data.filter((r) => (r.session || "morning") === "morning").length,
          evening: attendanceRes.data.filter((r) => r.session === "evening").length,
        });
      } catch {
        // silently handle
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  const appealsByKey = Object.fromEntries(
    appeals.map((a) => [`${a.date}-${a.session || "morning"}`, a])
  );

  async function handleAppealConfirm(date, session, reason) {
    await api.post("/appeals", { date, session, reason });
    const res = await api.get("/appeals/my");
    setAppeals(res.data);
  }

  // Flat filtered records (used for grouping)
  const filteredFlat = useMemo(() => records.filter((r) => {
    if (statusFilter  && r.status !== statusFilter) return false;
    if (sessionFilter && (r.session || "morning") !== sessionFilter) return false;
    if (dateFrom && r.date < dateFrom) return false;
    if (dateTo   && r.date > dateTo)   return false;
    return true;
  }), [records, statusFilter, sessionFilter, dateFrom, dateTo]);

  // Group into per-day cards
  const groupedDays = useMemo(() => {
    const groups = groupByDate(filteredFlat);
    // When a session filter is active, only show days that have that session
    if (!sessionFilter) return groups;
    return groups.filter((g) => sessionFilter === "morning" ? g.morning !== null : g.evening !== null);
  }, [filteredFlat, sessionFilter]);

  const hasFilters = statusFilter || sessionFilter || dateFrom || dateTo;

  function clearFilters() {
    setStatusFilter(""); setSessionFilter(""); setDateFrom(""); setDateTo("");
  }

  return (
    <PageWrapper
      title="Attendance History"
      description="Each card shows both your Work Start and Work End for the day in one place."
    >
      {appealModalInfo && (
        <AppealModal
          date={appealModalInfo.date}
          session={appealModalInfo.session}
          onConfirm={handleAppealConfirm}
          onClose={() => setAppealModalInfo(null)}
        />
      )}

      <div className="space-y-5">

        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="card py-4">
            <p className="section-label">Total Records</p>
            <p className="metric-value mt-3">{stats.total}</p>
          </div>
          <div className="card py-4">
            <p className="section-label">Present</p>
            <p className="metric-value mt-3">{stats.present}</p>
          </div>
          <div className="card py-4">
            <p className="section-label">Work Start</p>
            <p className="metric-value mt-3">{stats.morning}</p>
          </div>
          <div className="card py-4">
            <p className="section-label">Work End</p>
            <p className="metric-value mt-3">{stats.evening}</p>
          </div>
        </div>

        {/* Records list */}
        <div className="card overflow-hidden p-0">

          {/* Card header */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div>
              <p className="section-label">Timeline</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Recent entries</h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">Latest 60 records (30 days × 2 sessions)</p>
          </div>

          {/* Filter bar */}
          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <select className="input-field w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value={ATTENDANCE_STATUS.PRESENT}>Present</option>
                <option value={ATTENDANCE_STATUS.ABSENT}>Absent</option>
                <option value="leave">Leave</option>
              </select>
              <select className="input-field w-auto" value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)}>
                <option value="">All sessions</option>
                <option value="morning">Work Start</option>
                <option value="evening">Work End</option>
              </select>
              <div className="flex items-center gap-2">
                <input type="date" className="input-field w-auto" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="From date" />
                <span className="text-xs text-slate-400 flex-shrink-0">to</span>
                <input type="date" className="input-field w-auto" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="To date" />
              </div>
              {hasFilters && (
                <button onClick={clearFilters} className="btn-secondary text-sm">Clear</button>
              )}
              <p className="ml-auto flex-shrink-0 text-sm text-slate-500">
                {groupedDays.length} {groupedDays.length === 1 ? "day" : "days"}
                {hasFilters && <span className="text-slate-400"> (filtered from {records.length} records)</span>}
              </p>
            </div>
          </div>

          {/* Day cards */}
          <div className="p-4 space-y-3">
            {loading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
                    <div className="space-y-2">
                      <div className="h-3.5 w-36 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-3">
                    <div className="flex-1 h-20 animate-pulse rounded-xl bg-slate-100" />
                    <div className="flex-1 h-20 animate-pulse rounded-xl bg-slate-100" />
                  </div>
                </div>
              ))
            ) : groupedDays.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-medium text-slate-500">
                  {hasFilters ? "No records match the current filters." : "No attendance records are available yet."}
                </p>
                {hasFilters && (
                  <button onClick={clearFilters} className="mt-3 text-sm font-semibold text-blue-600 hover:underline">
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              groupedDays.map((group) => (
                <DayCard
                  key={group.date}
                  group={group}
                  user={user}
                  appealsByKey={appealsByKey}
                  onAppeal={(date, session) => setAppealModalInfo({ date, session })}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}