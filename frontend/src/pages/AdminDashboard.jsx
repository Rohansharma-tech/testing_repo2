import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { AttendanceReasonBadge, AttendanceStatusBadge } from "../components/AttendanceBadges";
import PageWrapper from "../components/PageWrapper";
import { ATTENDANCE_STATUS } from "../utils/attendance";

// ─── User Avatar ──────────────────────────────────────────────────────────────

function UserAvatar({ source, size = "md" }) {
  // Increased base sizes: sm is now 10, md is 12, lg is 16, xl is 20
  const sizeClasses = {
    sm: "h-10 w-10 text-sm",
    md: "h-12 w-12 text-base",
    lg: "h-16 w-16 text-xl",
    xl: "h-20 w-20 text-2xl",
  };
  const base = `${sizeClasses[size]} flex-shrink-0 rounded-full object-cover`;

  // Handle both user object formats (users vs attendance records)
  const name = source?.name || source?.userName || "?";
  let initials = "?";
  if (name !== "?") {
    initials = name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  }

  // Handle path from either direct user profileImage or record.userProfileImage
  const rawPath = source?.profileImageUrl || source?.profileImage || source?.userProfileImage;
  const src = rawPath?.startsWith("/") ? rawPath : (rawPath ? `/${rawPath}` : null);
  
  const [broken, setBroken] = useState(false);

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name}
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


function formatFriendlyDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departmentFilter, setDepartmentFilter] = useState("all");

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, usersRes, recordsRes] = await Promise.all([
          api.get("/attendance/stats"),
          api.get("/users"),
          api.get("/attendance/all"),
        ]);

        setStats(statsRes.data);
        setUsers(usersRes.data.filter((user) => user.role === "user"));
        setRecords(recordsRes.data);
      } catch (err) {
        console.error("Admin dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Unique departments derived from the user list
  const availableDepartments = useMemo(() => {
    return [...new Set(users.map((u) => u.department).filter(Boolean))].sort();
  }, [users]);

  const workforce = useMemo(() => {
    const todayRecords = new Map(
      records
        .filter((record) => record.date === stats?.date)
        .map((record) => [String(record.userId), record])
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

  // Apply department filter on the workforce list
  const filteredWorkforce = useMemo(() => {
    if (departmentFilter === "all") return workforce;
    return workforce.filter((emp) => emp.department === departmentFilter);
  }, [workforce, departmentFilter]);

  const latestEvents = records.filter((record) => record.date === stats?.date).slice(0, 8);

  return (
    <PageWrapper
      title="Admin Dashboard"
      description={
        stats?.date
          ? `Operational summary for ${formatFriendlyDate(stats.date)}.`
          : "Operational summary for today's attendance activity."
      }
    >
      <div className="space-y-6">
        {/* ── Stat cards ── */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="card">
            <p className="section-label">Employees</p>
            <p className="metric-value mt-4">{stats?.totalUsers ?? 0}</p>
            <p className="metric-label">Registered user accounts</p>
          </div>
          <div className="card">
            <p className="section-label">Present Today</p>
            <p className="metric-value mt-4">{stats?.presentToday ?? 0}</p>
            <p className="metric-label">Successful attendance submissions</p>
          </div>
          <div className="card">
            <p className="section-label">Absent Today</p>
            <p className="metric-value mt-4">{stats?.absentToday ?? 0}</p>
            <p className="metric-label">Users with blocked attendance records</p>
          </div>
          <div className="card">
            <p className="section-label">Outside Location</p>
            <p className="metric-value mt-4">{stats?.outsideLocationToday ?? 0}</p>
            <p className="metric-label">Absent records caused by geofence violations</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          {/* ── Workforce status ── */}
          <section className="card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-label">Workforce Status</p>
                <h2 className="mt-3 text-xl font-semibold text-slate-900">
                  Today's employee overview
                </h2>
              </div>
              <Link to="/admin/users" className="text-sm font-semibold text-blue-700">
                Manage users
              </Link>
            </div>

            {/* Department filter */}
            {availableDepartments.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <select
                  className="input-field max-w-xs flex-1"
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                >
                  <option value="all">All departments</option>
                  {availableDepartments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
                {departmentFilter !== "all" && (
                  <button
                    onClick={() => setDepartmentFilter("all")}
                    className="btn-secondary text-xs"
                  >
                    Reset
                  </button>
                )}
                <p className="text-sm text-slate-500">
                  {filteredWorkforce.length} employee
                  {filteredWorkforce.length !== 1 ? "s" : ""}
                </p>
              </div>
            )}

            <div className="mt-6 space-y-3">
              {loading ? (
                [1, 2, 3, 4].map((item) => (
                  <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
                    <div className="mt-3 h-3 w-36 animate-pulse rounded bg-slate-200" />
                  </div>
                ))
              ) : filteredWorkforce.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">
                  {departmentFilter === "all"
                    ? "No employee accounts are available."
                    : `No employees found in the "${departmentFilter}" department.`}
                </div>
              ) : (
                filteredWorkforce.map((employee) => (
                  <div key={employee.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      
                      <div className="flex items-center gap-4">
                        <UserAvatar source={employee} size="lg" />
                        <div>
                          <p className="text-base font-semibold text-slate-900">{employee.name}</p>
                          <p className="mt-0.5 text-sm text-slate-500">{employee.email}</p>
                          {employee.department && (
                            <p className="mt-1 text-xs text-slate-400">
                              {employee.department}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <AttendanceStatusBadge status={employee.status} />
                            <AttendanceReasonBadge reason={employee.reason} />
                            <span
                              className={
                                employee.hasFace
                                  ? "status-chip status-chip-success"
                                  : "status-chip status-chip-warning"
                              }
                            >
                              {employee.hasFace ? "Face Registered" : "Face Missing"}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-3 text-sm text-slate-500 lg:mt-0 lg:text-right">
                        <p>
                          {employee.time
                            ? `Last event at ${employee.time}`
                            : "No attendance event today"}
                        </p>
                        {employee.distanceMeters !== null && employee.distanceMeters !== undefined && (
                          <p className="mt-1">Distance: {employee.distanceMeters} m</p>
                        )}
                      </div>

                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* ── Right column ── */}
          <section className="space-y-6">
            <div className="card">
              <p className="section-label">Follow-up</p>
              <div className="mt-5 grid gap-3">
                <Link to="/admin/attendance" className="btn-primary w-full">
                  View attendance records
                </Link>
                <Link to="/admin/users" className="btn-secondary w-full">
                  Review users and face registration
                </Link>
              </div>
            </div>

            <div className="card">
              <p className="section-label">Today's Activity</p>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">Latest attendance events</h2>

              <div className="mt-6 space-y-3">
                {loading ? (
                  [1, 2, 3].map((item) => (
                    <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                      <div className="mt-3 h-3 w-28 animate-pulse rounded bg-slate-200" />
                    </div>
                  ))
                ) : latestEvents.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">
                    No attendance events have been recorded today.
                  </div>
                ) : (
                  latestEvents.map((record) => (
                    <div key={record.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <UserAvatar source={record} size="md" />
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{record.userName}</p>
                            <p className="mt-0.5 text-sm text-slate-500">{record.userEmail}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <AttendanceStatusBadge status={record.status} />
                          <AttendanceReasonBadge reason={record.reason} />
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-slate-500">
                        {record.time ? `Recorded at ${record.time}` : "No time available"}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageWrapper>
  );
}