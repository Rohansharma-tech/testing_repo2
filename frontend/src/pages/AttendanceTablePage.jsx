import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import { AttendanceReasonBadge, AttendanceStatusBadge } from "../components/AttendanceBadges";
import PageWrapper from "../components/PageWrapper";
import { formatTime12h } from "../utils/attendance";

// ─── Export helpers ───────────────────────────────────────────────────────────

function recordsToCSV(records) {
  const headers = ["Name", "Email", "Date", "Session", "Time", "Status", "Reason", "Latitude", "Longitude", "Accuracy (m)", "Distance (m)", "Source", "Penalty"];
  const escape = (val) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    return str.includes(",") || str.includes('"') || str.includes("\n")
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };

  const rows = records.map((r) => [
    escape(r.userName),
    escape(r.userEmail),
    escape(r.date),
    escape(r.session || "morning"),
    escape(r.time || ""),
    escape(r.status),
    escape(r.reason || ""),
    escape(r.latitude !== null && r.latitude !== undefined ? r.latitude.toFixed(6) : ""),
    escape(r.longitude !== null && r.longitude !== undefined ? r.longitude.toFixed(6) : ""),
    escape(r.locationAccuracy !== null && r.locationAccuracy !== undefined ? Math.round(r.locationAccuracy) : ""),
    escape(r.distanceMeters !== null && r.distanceMeters !== undefined ? r.distanceMeters : ""),
    escape(r.source || "normal"),
    escape(r.penalty ? "Yes" : "No"),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildFilename(ext, filters) {
  const parts = ["attendance"];
  if (filters.date) parts.push(filters.date);
  if (filters.status !== "all") parts.push(filters.status);
  if (filters.session !== "all") parts.push(filters.session);
  if (filters.search) parts.push("filtered");
  parts.push(new Date().toISOString().slice(0, 10));
  return `${parts.join("_")}.${ext}`;
}

// ─── Group flat records into { userId+date } → { morning, evening } ──────────

function groupRecordsByUserDate(records) {
  const map = new Map();
  for (const r of records) {
    const key = `${r.userId || r.id}_${r.date}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        userId: r.userId,
        userName: r.userName,
        userEmail: r.userEmail,
        userDepartment: r.userDepartment,
        userProfileImage: r.userProfileImage,
        date: r.date,
        morning: null,
        evening: null,
      });
    }
    const entry = map.get(key);
    const session = r.session || "morning";
    if (session === "morning") entry.morning = r;
    else entry.evening = r;
  }
  // Sort newest date first
  return [...map.values()].sort((a, b) => (b.date > a.date ? 1 : -1));
}

// ─── Export dropdown button ───────────────────────────────────────────────────

function ExportMenu({ onExportCSV, onExportJSON, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="btn-primary flex items-center gap-2 disabled:opacity-50"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
        </svg>
        Export
        <svg className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-52 rounded-2xl border border-slate-200 bg-white shadow-lg">
          <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Export filtered records
          </p>
          <ul className="py-2">
            <li>
              <button
                type="button"
                onClick={() => { onExportCSV(); setOpen(false); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-100 text-xs font-bold text-green-700">CSV</span>
                Export as CSV
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => { onExportJSON(); setOpen(false); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-blue-700">JSON</span>
                Export as JSON
              </button>
            </li>
          </ul>
          <div className="border-t border-slate-100 px-4 py-2.5">
            <p className="text-xs text-slate-400">Only currently filtered rows are exported.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Active filter pills ──────────────────────────────────────────────────────

function FilterPill({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
      {label}
      <button type="button" onClick={onRemove} className="hover:text-blue-900">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

// ─── User Avatar ──────────────────────────────────────────────────────────────

function UserAvatar({ record }) {
  const initials = record.userName
    ? record.userName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "?";

  const src = record.userProfileImage ? `/${record.userProfileImage}` : null;
  const [broken, setBroken] = useState(false);

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={record.userName}
        className="h-12 w-12 flex-shrink-0 rounded-full border border-slate-200 object-cover shadow-sm"
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div className="h-12 w-12 flex-shrink-0 rounded-full flex items-center justify-center bg-blue-600 font-semibold text-white text-sm shadow-sm">
      {initials}
    </div>
  );
}

// ─── Session Status Block ─────────────────────────────────────────────────────

function SessionBlock({ label, record, accent }) {
  const colors = {
    blue: {
      header: "bg-blue-50 border-blue-100 text-blue-700",
      border: "border-blue-100",
    },
    indigo: {
      header: "bg-indigo-50 border-indigo-100 text-indigo-700",
      border: "border-indigo-100",
    },
  };
  const c = colors[accent] || colors.blue;

  if (!record) {
    return (
      <div className={`rounded-xl border ${c.border} overflow-hidden flex-1 min-w-0`}>
        <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${c.header}`}>
          {label}
        </div>
        <div className="px-3 py-3 text-xs text-slate-400 italic">No record</div>
      </div>
    );
  }

  const statusColors = {
    present: "text-emerald-700",
    absent: "text-rose-600",
    leave: "text-amber-700",
  };

  return (
    <div className={`rounded-xl border ${c.border} overflow-hidden flex-1 min-w-0`}>
      {/* Session label header */}
      <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${c.header}`}>
        {label}
      </div>

      <div className="px-3 py-3 space-y-2">
        {/* Status row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <AttendanceStatusBadge status={record.status} />
          {record.autoMarked && (
            <span className="status-chip status-chip-neutral text-[10px]">Auto</span>
          )}
          {record.penalty && (
            <span className="status-chip bg-rose-100 text-rose-800 border-rose-200 font-bold text-[10px]">Penalty</span>
          )}
          {record.source && record.source !== "normal" && (
            <span className="status-chip bg-purple-100 text-purple-800 border-purple-200 uppercase text-[9px] tracking-wider font-bold">
              {record.source}
            </span>
          )}
        </div>

        {/* Reason badge */}
        {record.reason && (
          <div>
            <AttendanceReasonBadge reason={record.reason} />
          </div>
        )}

        {/* Time */}
        <p className="text-xs text-slate-600">
          <span className="text-slate-400">Time:</span>{" "}
          <span className={`font-medium ${statusColors[record.status] || "text-slate-700"}`}>
            {record.time ? formatTime12h(record.time) : "--:--"}
          </span>
        </p>

        {/* Location */}
        {record.latitude !== null && record.longitude !== null ? (
          <p className="text-xs text-slate-500">
            <span className="text-slate-400">Coords:</span>{" "}
            {record.latitude.toFixed(5)}, {record.longitude.toFixed(5)}
          </p>
        ) : (
          <p className="text-xs text-slate-400">No location</p>
        )}

        {/* Accuracy */}
        {record.locationAccuracy !== null && record.locationAccuracy !== undefined && (
          <p className="text-xs text-slate-500">
            <span className="text-slate-400">Accuracy:</span>{" "}
            {Math.round(record.locationAccuracy)} m
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Combined User-Date Card ──────────────────────────────────────────────────

function AttendanceGroupCard({ group }) {
  const morningStatus = group.morning?.status;
  const eveningStatus = group.evening?.status;

  // Overall status pill for the right side
  const overallPresent =
    morningStatus === "present" && eveningStatus === "present";
  const overallAbsent =
    morningStatus === "absent" && eveningStatus === "absent";
  const overallLeave =
    morningStatus === "leave" && eveningStatus === "leave";

  let overallLabel = "Partial";
  let overallClass = "bg-amber-50 text-amber-700 border-amber-200";
  if (overallPresent) {
    overallLabel = "Full Day Present";
    overallClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
  } else if (overallAbsent) {
    overallLabel = "Full Day Absent";
    overallClass = "bg-rose-50 text-rose-700 border-rose-200";
  } else if (overallLeave) {
    overallLabel = "On Leave";
    overallClass = "bg-blue-50 text-blue-700 border-blue-200";
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      {/* ── Top row: user info + date + overall status ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <UserAvatar record={group} />
          <div>
            <p className="text-sm font-semibold text-slate-900">{group.userName}</p>
            <p className="text-xs text-slate-500">{group.userEmail}</p>
            {group.userDepartment && (
              <p className="text-xs text-slate-400 mt-0.5">
                Dept: <span className="font-medium text-slate-600">{group.userDepartment}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <p className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
            {group.date}
          </p>
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${overallClass}`}>
            {overallLabel}
          </span>
        </div>
      </div>

      {/* ── Bottom row: two session blocks side by side ── */}
      <div className="mt-4 flex gap-3 flex-col sm:flex-row">
        <SessionBlock label="Work Start" record={group.morning} accent="blue" />
        <SessionBlock label="Work End" record={group.evening} accent="indigo" />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AttendanceTablePage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sessionFilter, setSessionFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [exportSuccess, setExportSuccess] = useState("");

  const allDepartments = useMemo(() => {
    return [...new Set(records.map((r) => r.userDepartment).filter(Boolean))].sort();
  }, [records]);

  useEffect(() => {
    async function fetchRecords() {
      try {
        const res = await api.get("/attendance/all");
        setRecords(res.data);
      } catch {
        // silently ignore — page renders with empty state
      } finally {
        setLoading(false);
      }
    }
    fetchRecords();
  }, []);

  // Flat filtered records (for export)
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        record.userName?.toLowerCase().includes(query) ||
        record.userEmail?.toLowerCase().includes(query);
      const matchesDate = !dateFilter || record.date === dateFilter;
      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      const matchesSession = sessionFilter === "all" || (record.session || "morning") === sessionFilter;
      const matchesDept =
        departmentFilter === "all" || record.userDepartment === departmentFilter;
      return matchesSearch && matchesDate && matchesStatus && matchesSession && matchesDept;
    });
  }, [dateFilter, departmentFilter, records, search, sessionFilter, statusFilter]);

  // Grouped records for display (one card per user per date)
  // When a session filter is active we still show the grouped card but filter
  // which user-dates appear (only show groups that have a matching session record).
  const groupedForDisplay = useMemo(() => {
    // Start from filtered flat records so search/date/dept/status filters apply
    const groups = groupRecordsByUserDate(filteredRecords);

    // If session filter is "all", show every group
    if (sessionFilter === "all") return groups;

    // Otherwise only show groups that have a record for the requested session
    return groups.filter((g) =>
      sessionFilter === "morning" ? g.morning !== null : g.evening !== null
    );
  }, [filteredRecords, sessionFilter]);

  const today = new Date().toISOString().split("T")[0];

  const activeFilters = [
    search && { label: `Search: "${search}"`, clear: () => setSearch("") },
    dateFilter && { label: `Date: ${dateFilter}`, clear: () => setDateFilter("") },
    statusFilter !== "all" && { label: `Status: ${statusFilter}`, clear: () => setStatusFilter("all") },
    sessionFilter !== "all" && { label: `Session: ${sessionFilter}`, clear: () => setSessionFilter("all") },
    departmentFilter !== "all" && { label: `Dept: ${departmentFilter}`, clear: () => setDepartmentFilter("all") },
  ].filter(Boolean);

  const hasFilters = activeFilters.length > 0;

  const currentFilters = { date: dateFilter, status: statusFilter, session: sessionFilter, search };

  function handleExportCSV() {
    const csv = recordsToCSV(filteredRecords);
    downloadFile(csv, buildFilename("csv", currentFilters), "text/csv;charset=utf-8;");
    flashSuccess(`Exported ${filteredRecords.length} records as CSV`);
  }

  function handleExportJSON() {
    const clean = filteredRecords.map((r) => ({
      name: r.userName,
      email: r.userEmail,
      department: r.userDepartment || null,
      date: r.date,
      session: r.session || "morning",
      time: r.time || null,
      status: r.status,
      reason: r.reason || null,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      accuracyMeters: r.locationAccuracy !== null && r.locationAccuracy !== undefined ? Math.round(r.locationAccuracy) : null,
      distanceMeters: r.distanceMeters ?? null,
      source: r.source || "normal",
      penalty: r.penalty || false,
    }));
    downloadFile(JSON.stringify(clean, null, 2), buildFilename("json", currentFilters), "application/json");
    flashSuccess(`Exported ${filteredRecords.length} records as JSON`);
  }

  function flashSuccess(msg) {
    setExportSuccess(msg);
    setTimeout(() => setExportSuccess(""), 3000);
  }

  function resetAllFilters() {
    setSearch("");
    setDateFilter("");
    setStatusFilter("all");
    setSessionFilter("all");
    setDepartmentFilter("all");
  }

  return (
    <PageWrapper
      title="Attendance Records"
      description="Each card shows both Work Start and Work End sessions for a user in a single view."
    >
      <div className="space-y-6">
        {/* ── Stats ── */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="card">
            <p className="section-label">Total Records</p>
            <p className="metric-value mt-4">{records.length}</p>
            <p className="metric-label">All attendance records</p>
          </div>
          <div className="card">
            <p className="section-label">Today</p>
            <p className="metric-value mt-4">{records.filter((r) => r.date === today).length}</p>
            <p className="metric-label">Events recorded today</p>
          </div>
          <div className="card">
            <p className="section-label">Work Start</p>
            <p className="metric-value mt-4">{records.filter((r) => (r.session || "morning") === "morning" && r.date === today).length}</p>
            <p className="metric-label">Work Start sessions today</p>
          </div>
          <div className="card">
            <p className="section-label">Work End</p>
            <p className="metric-value mt-4">{records.filter((r) => r.session === "evening" && r.date === today).length}</p>
            <p className="metric-label">Work End sessions today</p>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="card">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto]">
            <input
              type="text"
              className="input-field"
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <input
              type="date"
              className="input-field"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            <select
              className="input-field"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="leave">Leave</option>
            </select>
            <select
              className="input-field"
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
            >
              <option value="all">All sessions</option>
              <option value="morning">Work Start</option>
              <option value="evening">Work End</option>
            </select>
            <select
              className="input-field"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="all">All departments</option>
              {allDepartments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
            <button onClick={resetAllFilters} className="btn-secondary">
              Reset
            </button>
          </div>

          {/* Active filter pills */}
          {hasFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Active:</span>
              {activeFilters.map((f) => (
                <FilterPill key={f.label} label={f.label} onRemove={f.clear} />
              ))}
            </div>
          )}
        </div>

        {/* ── Results header + export ── */}
        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="section-label">Results</p>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">
                {groupedForDisplay.length} user-day record{groupedForDisplay.length !== 1 ? "s" : ""}
                {hasFilters && (
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    ({filteredRecords.length} sessions from {records.length} total)
                  </span>
                )}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              {exportSuccess && (
                <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {exportSuccess}
                </span>
              )}
              <ExportMenu
                onExportCSV={handleExportCSV}
                onExportJSON={handleExportJSON}
                disabled={filteredRecords.length === 0}
              />
            </div>
          </div>

          {/* ── Grouped record list ── */}
          <div className="mt-6 space-y-3">
            {loading ? (
              [1, 2, 3].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
                  <div className="mt-3 h-3 w-36 animate-pulse rounded bg-slate-200" />
                  <div className="mt-4 flex gap-3">
                    <div className="flex-1 h-24 animate-pulse rounded-xl bg-slate-100" />
                    <div className="flex-1 h-24 animate-pulse rounded-xl bg-slate-100" />
                  </div>
                </div>
              ))
            ) : groupedForDisplay.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                <p className="text-sm text-slate-500">No attendance records match the current filters.</p>
                {hasFilters && (
                  <button onClick={resetAllFilters} className="mt-3 text-sm font-medium text-blue-700 hover:underline">
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              groupedForDisplay.map((group) => (
                <AttendanceGroupCard key={group.key} group={group} />
              ))
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}