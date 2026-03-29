import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { AttendanceReasonBadge, AttendanceStatusBadge } from "../components/AttendanceBadges";
import PageWrapper from "../components/PageWrapper";
import { useAuth } from "../context/AuthContext";
import { ATTENDANCE_STATUS, formatRecordSummary } from "../utils/attendance";

// ─── User Avatar ──────────────────────────────────────────────────────────────

function UserAvatar({ user, size = "lg" }) {
  const sizeClasses = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg" };
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
        className={`${base} border-2 border-slate-200`}
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

export default function UserDashboard() {
  const { user } = useAuth();
  const [todayStatus, setTodayStatus] = useState(null);
  const [recentRecords, setRecentRecords] = useState([]);
  const [presentThisMonth, setPresentThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [todayRes, historyRes] = await Promise.all([
          api.get("/attendance/today"),
          api.get("/attendance/my"),
        ]);

        setTodayStatus(todayRes.data);
        setRecentRecords(historyRes.data.slice(0, 6));
        const currentMonth = new Date().toISOString().slice(0, 7);
        setPresentThisMonth(
          historyRes.data.filter(
            (record) => record.status === ATTENDANCE_STATUS.PRESENT && record.date.startsWith(currentMonth)
          ).length
        );
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);
  const todayRecord = todayStatus?.record;

  return (
    <PageWrapper
      title="Employee Dashboard"
      description="Review today’s verification status, face registration, and your recent attendance activity."
    >
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="card md:col-span-2">
              <p className="section-label">Today</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <AttendanceStatusBadge status={todayStatus?.status || ATTENDANCE_STATUS.NOT_MARKED} />
                <AttendanceReasonBadge reason={todayRecord?.reason} />
              </div>
              <div className="mt-5 flex items-center gap-4">
                <UserAvatar user={user} size="lg" />
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{user?.name}</h2>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {loading ? "Checking current attendance state..." : formatRecordSummary(todayRecord)}
              </p>
              {!loading && todayRecord?.distanceMeters !== null && todayRecord?.distanceMeters !== undefined && (
                <p className="mt-3 text-sm text-slate-500">
                  Last recorded distance from geofence: {todayRecord.distanceMeters} m
                </p>
              )}
            </div>

            <div className="card">
              <p className="section-label">Face Registration</p>
              <div className="mt-4">
                <span className={user?.hasFace ? "status-chip status-chip-success" : "status-chip status-chip-warning"}>
                  {user?.hasFace ? "Registered" : "Pending"}
                </span>
              </div>
              <p className="mt-5 text-sm text-slate-500">
                {user?.hasFace
                  ? "Face registration is locked and ready for attendance verification."
                  : "Complete one-time face registration before marking attendance."}
              </p>
              <Link to="/register-face" className="btn-secondary mt-5 w-full">
                {user?.hasFace ? "View Registration Status" : "Register Face"}
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Link to="/mark-attendance" className="card transition hover:-translate-y-0.5">
              <p className="section-label">Action</p>
              <h3 className="mt-4 text-xl font-semibold text-slate-900">Mark attendance</h3>
              <p className="mt-2 text-sm text-slate-500">
                Start location validation and face verification from the approved site.
              </p>
            </Link>

            <Link to="/my-attendance" className="card transition hover:-translate-y-0.5">
              <p className="section-label">Records</p>
              <h3 className="mt-4 text-xl font-semibold text-slate-900">View history</h3>
              <p className="mt-2 text-sm text-slate-500">Check present and absent records for recent working days.</p>
            </Link>

            <div className="card">
              <p className="section-label">This Month</p>
              <p className="metric-value mt-4">{presentThisMonth}</p>
              <p className="metric-label">Present entries in the current month</p>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          {!user?.hasFace && (
            <div className="card border border-amber-200 bg-amber-50">
              <p className="section-label text-amber-700">Action Required</p>
              <h3 className="mt-3 text-lg font-semibold text-amber-900">Face registration is pending</h3>
              <p className="mt-2 text-sm text-amber-800">
                Attendance submission stays blocked until your face is registered once.
              </p>
              <Link to="/register-face" className="btn-primary mt-5 w-full">
                Register now
              </Link>
            </div>
          )}

          <div className="card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-label">Recent Records</p>
                <h3 className="mt-3 text-xl font-semibold text-slate-900">Attendance history</h3>
              </div>
              <Link to="/my-attendance" className="text-sm font-semibold text-blue-700">
                View all
              </Link>
            </div>

            <div className="mt-6 space-y-3">
              {loading ? (
                [1, 2, 3].map((item) => (
                  <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                    <div className="mt-3 h-3 w-32 animate-pulse rounded bg-slate-200" />
                  </div>
                ))
              ) : recentRecords.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  No attendance records are available yet.
                </div>
              ) : (
                recentRecords.map((record) => (
                  <div key={record.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{formatFriendlyDate(record.date)}</p>
                        <p className="mt-1 text-sm text-slate-500">{record.time ? `Recorded at ${record.time}` : "No time available"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <AttendanceStatusBadge status={record.status} />
                        <AttendanceReasonBadge reason={record.reason} />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}
