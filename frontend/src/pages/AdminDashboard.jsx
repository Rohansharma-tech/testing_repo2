import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { AttendanceReasonBadge, AttendanceStatusBadge } from "../components/AttendanceBadges";
import PageWrapper from "../components/PageWrapper";
import { ATTENDANCE_STATUS, formatTime12h } from "../utils/attendance";

// ─── User Avatar ──────────────────────────────────────────────────────────────

function UserAvatar({ source, size = "md" }) {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-9 w-9 text-sm",
    lg: "h-11 w-11 text-base",
  };
  const base = `${sizeClasses[size]} flex-shrink-0 rounded-full object-cover`;

  const name = source?.name || source?.userName || "?";
  const initials =
    name !== "?"
      ? name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
      : "?";

  const rawPath =
    source?.profileImageUrl || source?.profileImage || source?.userProfileImage;
  const src = rawPath?.startsWith("/") ? rawPath : rawPath ? `/${rawPath}` : null;
  const [broken, setBroken] = useState(false);

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name}
        className={`${base} border border-slate-200`}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div
      className={`${base} flex items-center justify-center bg-blue-600 font-semibold text-white`}
    >
      {initials}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFriendlyDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }) {
  return (
    <div className="card py-4">
      <p className="section-label">{label}</p>
      <p className="metric-value mt-3">{value ?? 0}</p>
      {sub && <p className="metric-label mt-1">{sub}</p>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  // Workforce filters
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, usersRes, recordsRes] = await Promise.all([
          api.get("/attendance/stats"),
          api.get("/users"),
          api.get("/attendance/all"),
        ]);
        setStats(statsRes.data);
        setUsers(usersRes.data.filter((u) => u.role === "user"));
        setRecords(recordsRes.data);
      } catch {
        // silently ignore
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Departments from users
  const availableDepartments = useMemo(
    () => [...new Set(users.map((u) => u.department).filter(Boolean))].sort(),
    [users]
  );

  // Build today's workforce
  const workforce = useMemo(() => {
    const todayRecords = new Map(
      records
        .filter((r) => r.date === stats?.date)
        .map((r) => [String(r.userId), r])
    );
    return users
      .map((user) => {
        const record = todayRecords.get(String(user._id));
        return {
          id: user._id,
          name: user.name,
          email: user.email,
          hasFace: user.hasFace,
          department: user.department || null,
          profileImage: user.profileImage,
          profileImageUrl: user.profileImageUrl,
          status: record?.status || ATTENDANCE_STATUS.NOT_MARKED,
          reason: record?.reason || null,
          time: record?.time || null,
          distanceMeters: record?.distanceMeters,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [records, stats?.date, users]);

  // Apply filters
  const filteredWorkforce = useMemo(() => {
    let result = workforce;
    const q = search.trim().toLowerCase();
    if (q)
      result = result.filter(
        (e) =>
          e.name?.toLowerCase().includes(q) ||
          e.email?.toLowerCase().includes(q)
      );
    if (departmentFilter)
      result = result.filter((e) => e.department === departmentFilter);
    if (statusFilter)
      result = result.filter((e) => e.status === statusFilter);
    return result;
  }, [workforce, search, departmentFilter, statusFilter]);

  const hasFilters = search || departmentFilter || statusFilter;

  return (
    <PageWrapper
      title="Admin Dashboard"
      description={
        stats?.date
          ? `Operational summary for ${formatFriendlyDate(stats.date)}.`
          : "Operational summary for today's attendance activity."
      }
    >
      <div className="space-y-5">

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard
            label="Total Employees"
            value={stats?.totalUsers}
            sub="Registered accounts"
          />
          <StatCard
            label="Present Today"
            value={stats?.presentToday}
            sub="Attendance confirmed"
          />
          <StatCard
            label="Absent Today"
            value={stats?.absentToday}
            sub="Blocked submissions"
          />
          <StatCard
            label="Outside Location"
            value={stats?.outsideLocationToday}
            sub="Geofence violations"
          />
        </div>

        {/* ── Workforce table ── */}
        <div className="card overflow-hidden p-0">

          {/* Card header */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div>
              <p className="section-label">Workforce Status</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Today's employee overview
              </h2>
            </div>
            <Link
              to="/admin/users"
              className="mt-1 text-sm font-semibold text-blue-700 hover:underline"
            >
              Manage users →
            </Link>
          </div>

          {/* Control bar */}
          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative min-w-0 flex-1">
                <svg
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 16.65a7.5 7.5 0 0012.15 0z"
                  />
                </svg>
                <input
                  type="text"
                  className="input-field pl-10"
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Department filter */}
              {availableDepartments.length > 0 && (
                <select
                  className="input-field w-auto"
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                >
                  <option value="">All departments</option>
                  {availableDepartments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}

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

              {/* Clear */}
              {hasFilters && (
                <button
                  onClick={() => {
                    setSearch("");
                    setDepartmentFilter("");
                    setStatusFilter("");
                  }}
                  className="btn-secondary text-sm"
                >
                  Clear
                </button>
              )}

              <p className="ml-auto flex-shrink-0 text-sm text-slate-500">
                {filteredWorkforce.length}{" "}
                {filteredWorkforce.length === 1 ? "employee" : "employees"}
                {hasFilters && (
                  <span className="text-slate-400">
                    {" "}(filtered from {workforce.length})
                  </span>
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
                      <div className="h-3 w-48 animate-pulse rounded bg-slate-200" />
                    </div>
                    <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-5 w-24 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : filteredWorkforce.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-medium text-slate-500">
                  {hasFilters
                    ? "No employees match the current filters."
                    : "No employee accounts are available."}
                </p>
                {hasFilters && (
                  <button
                    onClick={() => {
                      setSearch("");
                      setDepartmentFilter("");
                      setStatusFilter("");
                    }}
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
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Employee
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Department
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Face
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Last Event
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Distance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWorkforce.map((employee) => (
                    <tr
                      key={employee.id}
                      className="transition-colors hover:bg-slate-50"
                    >
                      {/* Employee name + avatar */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <UserAvatar source={employee} size="md" />
                          <span className="font-medium text-slate-900">
                            {employee.name}
                          </span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="max-w-[200px] px-4 py-3.5">
                        <span className="truncate text-slate-500">
                          {employee.email}
                        </span>
                      </td>

                      {/* Department */}
                      <td className="px-4 py-3.5">
                        {employee.department ? (
                          <span className="status-chip bg-slate-100 text-slate-600">
                            {employee.department}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Attendance status */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          <AttendanceStatusBadge status={employee.status} />
                          {employee.reason && (
                            <AttendanceReasonBadge reason={employee.reason} />
                          )}
                        </div>
                      </td>

                      {/* Face */}
                      <td className="px-4 py-3.5">
                        <span
                          className={
                            employee.hasFace
                              ? "status-chip status-chip-success"
                              : "status-chip status-chip-warning"
                          }
                        >
                          {employee.hasFace ? "Registered" : "Pending"}
                        </span>
                      </td>

                      {/* Last event time */}
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {employee.time
                          ? formatTime12h(employee.time)
                          : <span className="text-slate-300">—</span>}
                      </td>

                      {/* Distance */}
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {employee.distanceMeters != null
                          ? `${employee.distanceMeters} m`
                          : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        {/* end workforce card */}

      </div>
    </PageWrapper>
  );
}