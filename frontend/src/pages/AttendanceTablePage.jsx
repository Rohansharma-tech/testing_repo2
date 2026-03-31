import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import { AttendanceReasonBadge, AttendanceStatusBadge } from "../components/AttendanceBadges";
import PageWrapper from "../components/PageWrapper";
import { formatTime12h } from "../utils/attendance";

// ─── Export helpers ───────────────────────────────────────────────────────────

function recordsToCSV(records) {
  const headers = ["Name", "Email", "Date", "Time", "Status", "Reason", "Latitude", "Longitude", "Accuracy (m)", "Distance (m)", "Source", "Penalty"];
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
  if (filters.search) parts.push("filtered");
  parts.push(new Date().toISOString().slice(0, 10));
  return `${parts.join("_")}.${ext}`;
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

function UserAvatar({ record, size = "lg" }) {
  const sizeClasses = {
    sm: "h-10 w-10 text-sm",
    md: "h-12 w-12 text-base",
    lg: "h-16 w-16 text-xl",
    xl: "h-20 w-20 text-2xl",
  };
  const base = `${sizeClasses[size]} flex-shrink-0 rounded-full object-cover`;

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
        className={`${base} border border-slate-200 shadow-sm`}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div className={`${base} flex items-center justify-center bg-blue-600 font-semibold text-white shadow-sm`}>
      {initials}
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
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [exportSuccess, setExportSuccess] = useState("");

  // Derive department list from records
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

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        record.userName?.toLowerCase().includes(query) ||
        record.userEmail?.toLowerCase().includes(query);
      const matchesDate = !dateFilter || record.date === dateFilter;
      const matchesStatus = statusFilter === "all" || record.status === statusFilter;
      const matchesDept =
        departmentFilter === "all" || record.userDepartment === departmentFilter;
      return matchesSearch && matchesDate && matchesStatus && matchesDept;
    });
  }, [dateFilter, departmentFilter, records, search, statusFilter]);

  const today = new Date().toISOString().split("T")[0];

  const activeFilters = [
    search && { label: `Search: "${search}"`, clear: () => setSearch("") },
    dateFilter && { label: `Date: ${dateFilter}`, clear: () => setDateFilter("") },
    statusFilter !== "all" && { label: `Status: ${statusFilter}`, clear: () => setStatusFilter("all") },
    departmentFilter !== "all" && { label: `Dept: ${departmentFilter}`, clear: () => setDepartmentFilter("all") },
  ].filter(Boolean);

  const hasFilters = activeFilters.length > 0;

  const currentFilters = { date: dateFilter, status: statusFilter, search };

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
    setDepartmentFilter("all");
  }

  return (
    <PageWrapper
      title="Attendance Records"
      description="Filter all attendance entries by date, user, department, and status — then export the results."
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
            <p className="section-label">Present</p>
            <p className="metric-value mt-4">{records.filter((r) => r.status === "present").length}</p>
            <p className="metric-label">Successful submissions</p>
          </div>
          <div className="card">
            <p className="section-label">Absent</p>
            <p className="metric-value mt-4">{records.filter((r) => r.status === "absent").length}</p>
            <p className="metric-label">Blocked attendance records</p>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="card">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
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
                {filteredRecords.length} matching record{filteredRecords.length !== 1 ? "s" : ""}
                {hasFilters && (
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    (filtered from {records.length} total)
                  </span>
                )}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              {/* Export success flash */}
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

          {/* ── Record list ── */}
          <div className="mt-6 space-y-3">
            {loading ? (
              [1, 2, 3, 4].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
                  <div className="mt-3 h-3 w-36 animate-pulse rounded bg-slate-200" />
                </div>
              ))
            ) : filteredRecords.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                <p className="text-sm text-slate-500">No attendance records match the current filters.</p>
                {hasFilters && (
                  <button onClick={resetAllFilters} className="mt-3 text-sm font-medium text-blue-700 hover:underline">
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              filteredRecords.map((record) => (
                <div key={record.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex items-start gap-3">
                      <UserAvatar record={record} />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{record.userName}</p>
                        <p className="mt-1 text-sm text-slate-500">{record.userEmail}</p>
                        {record.userDepartment && (
                          <p className="mt-1 text-xs text-slate-400">
                            Dept: <span className="font-medium text-slate-600">{record.userDepartment}</span>
                          </p>
                        )}
                        <div className="mt-3 grid gap-2 text-sm text-slate-500 sm:grid-cols-2">
                          <p>Date: {record.date}</p>
                          <p>Time: {record.time ? formatTime12h(record.time) : "--:--"}</p>
                          <p>
                            Coordinates:{" "}
                            {record.latitude !== null && record.longitude !== null
                              ? `${record.latitude.toFixed(5)}, ${record.longitude.toFixed(5)}`
                              : "Not available"}
                          </p>
                          <p>
                            Accuracy:{" "}
                            {record.locationAccuracy !== null && record.locationAccuracy !== undefined
                              ? `${Math.round(record.locationAccuracy)} m`
                              : "Not available"}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <AttendanceStatusBadge status={record.status} />
                      <AttendanceReasonBadge reason={record.reason} />
                      {record.autoMarked && (
                        <span className="status-chip status-chip-neutral">Auto-Marked</span>
                      )}
                      {record.penalty && (
                        <span className="status-chip bg-rose-100 text-rose-800 border-rose-200 font-bold">Penalty</span>
                      )}
                      {record.source && record.source !== "normal" && (
                        <span className="status-chip bg-purple-100 text-purple-800 border-purple-200 uppercase text-[10px] tracking-wider font-bold">
                          {record.source}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}