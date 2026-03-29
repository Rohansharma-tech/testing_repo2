import { useEffect, useState } from "react";
import api from "../api/axios";
import { AttendanceReasonBadge, AttendanceStatusBadge } from "../components/AttendanceBadges";
import PageWrapper from "../components/PageWrapper";
import { useAuth } from "../context/AuthContext";
import { ATTENDANCE_STATUS } from "../utils/attendance";

// ─── User Avatar ──────────────────────────────────────────────────────────────

function UserAvatar({ user, size = "md" }) {
  const sizeClasses = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm" };
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

export default function MyAttendancePage() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, present: 0, absent: 0 });

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await api.get("/attendance/my");
        setRecords(res.data);
        setStats({
          total: res.data.length,
          present: res.data.filter((record) => record.status === ATTENDANCE_STATUS.PRESENT).length,
          absent: res.data.filter((record) => record.status === ATTENDANCE_STATUS.ABSENT).length,
        });
      } catch (err) {
        console.error("History fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, []);

  return (
    <PageWrapper
      title="Attendance History"
      description="Review recent attendance entries with present, absent, and outside-location outcomes."
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card">
            <p className="section-label">Total Records</p>
            <p className="metric-value mt-4">{stats.total}</p>
            <p className="metric-label">Recent attendance records stored for your account</p>
          </div>
          <div className="card">
            <p className="section-label">Present</p>
            <p className="metric-value mt-4">{stats.present}</p>
            <p className="metric-label">Successful submissions</p>
          </div>
          <div className="card">
            <p className="section-label">Absent</p>
            <p className="metric-value mt-4">{stats.absent}</p>
            <p className="metric-label">Blocked or incomplete attendance days</p>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="section-label">Timeline</p>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">Recent entries</h2>
            </div>
            <p className="text-sm text-slate-500">Latest 30 records</p>
          </div>

          <div className="mt-6 space-y-3">
            {loading ? (
              [1, 2, 3, 4].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
                  <div className="mt-3 h-3 w-28 animate-pulse rounded bg-slate-200" />
                </div>
              ))
            ) : records.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">
                No attendance records are available yet.
              </div>
            ) : (
              records.map((record) => (
                <div key={record.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                      <UserAvatar user={user} />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{formatFriendlyDate(record.date)}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {record.time ? `Recorded at ${record.time}` : "Time not available"}
                        </p>
                        {record.latitude !== null && record.longitude !== null && (
                          <p className="mt-2 text-sm text-slate-500">
                            {record.latitude.toFixed(5)}, {record.longitude.toFixed(5)}
                          </p>
                        )}
                        {record.distanceMeters !== null && record.distanceMeters !== undefined && (
                          <p className="mt-2 text-sm text-slate-500">Distance from geofence: {record.distanceMeters} m</p>
                        )}
                      </div>
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
      </div>
    </PageWrapper>
  );
}
