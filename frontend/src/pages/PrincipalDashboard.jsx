import { useEffect, useMemo, useState, useCallback } from "react";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";

// ── Palette ──────────────────────────────────────────────────────────────────
const COLOR = {
  present: "#10b981",   // emerald-500
  absent:  "#f43f5e",   // rose-500
  leave:   "#f59e0b",   // amber-500
  total:   "#6366f1",   // indigo-500
};

const PIE_COLORS = [COLOR.present, COLOR.absent, COLOR.leave];

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, subtitle, color, icon }) {
  const bg = {
    emerald: "from-emerald-50 to-emerald-100 border-emerald-200",
    rose:    "from-rose-50 to-rose-100 border-rose-200",
    amber:   "from-amber-50 to-amber-100 border-amber-200",
    indigo:  "from-indigo-50 to-indigo-100 border-indigo-200",
    slate:   "from-slate-50 to-slate-100 border-slate-200",
    violet:  "from-violet-50 to-violet-100 border-violet-200",
  }[color] ?? "from-slate-50 to-slate-100 border-slate-200";

  const text = {
    emerald: "text-emerald-700",
    rose:    "text-rose-700",
    amber:   "text-amber-700",
    indigo:  "text-indigo-700",
    slate:   "text-slate-700",
    violet:  "text-violet-700",
  }[color] ?? "text-slate-700";

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${bg} p-5 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wider ${text} opacity-80`}>{label}</p>
          <p className={`mt-2 text-3xl font-bold ${text}`}>{value ?? "—"}</p>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 shadow-sm ${text}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ── Section heading ────────────────────────────────────────────────────────────

function Section({ title, subtitle, children, actions }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div>
          <p className="section-label">{subtitle}</p>
          <h2 className="mt-0.5 text-base font-semibold text-slate-900">{title}</h2>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ── Custom Tooltip (Recharts) ──────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg text-xs">
      <p className="mb-2 font-semibold text-slate-700">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── Read-only badge ────────────────────────────────────────────────────────────

function ReadOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
      Read-only View
    </span>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function PrincipalDashboard() {
  // Summary state
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryDate, setSummaryDate] = useState(today());

  // Trends state
  const [trends, setTrends] = useState([]);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [trendRange, setTrendRange] = useState("week");
  const [customFrom, setCustomFrom] = useState(nDaysAgo(13));
  const [customTo, setCustomTo] = useState(today());

  // Dept stats state
  const [deptStats, setDeptStats] = useState([]);
  const [deptLoading, setDeptLoading] = useState(true);
  const [deptDate, setDeptDate] = useState(today());

  // ── Fetchers ─────────────────────────────────────────────────────────────────

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await api.get(`/attendance/summary?date=${summaryDate}`);
      setSummary(res.data);
    } catch { setSummary(null); }
    finally { setSummaryLoading(false); }
  }, [summaryDate]);

  const fetchTrends = useCallback(async () => {
    setTrendsLoading(true);
    try {
      let url = `/attendance/trends?range=${trendRange}`;
      if (trendRange === "custom") url += `&from=${customFrom}&to=${customTo}`;
      const res = await api.get(url);
      setTrends(res.data);
    } catch { setTrends([]); }
    finally { setTrendsLoading(false); }
  }, [trendRange, customFrom, customTo]);

  const fetchDeptStats = useCallback(async () => {
    setDeptLoading(true);
    try {
      const res = await api.get(`/attendance/department-stats?date=${deptDate}`);
      setDeptStats(res.data);
    } catch { setDeptStats([]); }
    finally { setDeptLoading(false); }
  }, [deptDate]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchTrends(); }, [fetchTrends]);
  useEffect(() => { fetchDeptStats(); }, [fetchDeptStats]);

  // ── Pie data ─────────────────────────────────────────────────────────────────

  const pieData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: "Present", value: summary.present },
      { name: "Absent",  value: summary.absent },
      { name: "On Leave", value: summary.onLeave },
    ].filter(d => d.value > 0);
  }, [summary]);

  // ── Trend chart label formatter ──────────────────────────────────────────────

  const trendData = useMemo(() =>
    trends.map(t => ({ ...t, label: fmtDate(t.date) })),
    [trends]
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <PageWrapper
      title="Analytics Dashboard"
      description="Institution-wide attendance analytics — read-only view for the Principal."
      actions={<ReadOnlyBadge />}
    >
      <div className="space-y-6">

        {/* ── Today's Summary Controls ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Today's Overview</h2>
            <p className="text-sm text-slate-500">Live attendance snapshot for a selected date</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="input-field w-auto text-sm"
              value={summaryDate}
              max={today()}
              onChange={(e) => setSummaryDate(e.target.value)}
            />
            <button onClick={fetchSummary} className="btn-secondary text-sm">Refresh</button>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        {summaryLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50 p-5 h-28 animate-pulse" />
            ))}
          </div>
        ) : summary ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              label="Total Employees"
              value={summary.totalEmployees}
              color="indigo"
              icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
            />
            <StatCard
              label="Present"
              value={summary.present}
              subtitle={`${summary.attendanceRate}% rate`}
              color="emerald"
              icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
            <StatCard
              label="Absent"
              value={summary.absent}
              color="rose"
              icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
            <StatCard
              label="On Leave"
              value={summary.onLeave}
              color="amber"
              icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
            />
            <StatCard
              label="Not Marked"
              value={summary.notMarked}
              color="slate"
              icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No data available for this date.
          </div>
        )}

        {/* ── Charts Row: Pie + Trend ── */}
        <div className="grid gap-6 lg:grid-cols-2">

          {/* Pie Chart */}
          <Section title="Attendance Distribution" subtitle={`As of ${summaryDate}`}>
            {summaryLoading ? (
              <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />
            ) : pieData.length === 0 ? (
              <div className="flex h-56 items-center justify-center text-sm text-slate-400">No data for this date</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" iconSize={10} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Section>

          {/* Trend Controls + Line Chart */}
          <Section
            title="Attendance Trends"
            subtitle="Daily breakdown"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {["week", "month", "custom"].map((r) => (
                  <button
                    key={r}
                    onClick={() => setTrendRange(r)}
                    className={`rounded-xl border px-3 py-1 text-xs font-semibold transition-all ${
                      trendRange === r
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {r === "week" ? "7 Days" : r === "month" ? "30 Days" : "Custom"}
                  </button>
                ))}
              </div>
            }
          >
            {trendRange === "custom" && (
              <div className="mb-4 flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">From</label>
                  <input type="date" className="input-field w-auto text-xs" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">To</label>
                  <input type="date" className="input-field w-auto text-xs" value={customTo} max={today()} onChange={(e) => setCustomTo(e.target.value)} />
                </div>
              </div>
            )}
            {trendsLoading ? (
              <div className="h-52 animate-pulse rounded-2xl bg-slate-100" />
            ) : trendData.length === 0 ? (
              <div className="flex h-52 items-center justify-center text-sm text-slate-400">No trend data</div>
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <LineChart data={trendData} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} />
                  <Line type="monotone" dataKey="present" name="Present" stroke={COLOR.present} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="absent"  name="Absent"  stroke={COLOR.absent}  strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="leave"   name="Leave"   stroke={COLOR.leave}   strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Section>
        </div>

        {/* ── Department Bar Chart ── */}
        <Section
          title="Department-wise Attendance"
          subtitle="Breakdown by department"
          actions={
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="input-field w-auto text-xs"
                value={deptDate}
                max={today()}
                onChange={(e) => setDeptDate(e.target.value)}
              />
              <button onClick={fetchDeptStats} className="btn-secondary text-xs">Refresh</button>
            </div>
          }
        >
          {deptLoading ? (
            <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
          ) : deptStats.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">No department data</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={deptStats} margin={{ top: 4, right: 10, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="dept"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="square" iconSize={10} verticalAlign="top" />
                <Bar dataKey="total"   name="Total"   fill={COLOR.total}   radius={[4,4,0,0]} />
                <Bar dataKey="present" name="Present" fill={COLOR.present} radius={[4,4,0,0]} />
                <Bar dataKey="absent"  name="Absent"  fill={COLOR.absent}  radius={[4,4,0,0]} />
                <Bar dataKey="leave"   name="Leave"   fill={COLOR.leave}   radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Section>

        {/* ── Footer note ── */}
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500">
          <svg className="h-4 w-4 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          This dashboard is <strong className="font-semibold text-slate-700">read-only</strong>. Attendance records can only be modified by the system or an Administrator.
        </div>

      </div>
    </PageWrapper>
  );
}
