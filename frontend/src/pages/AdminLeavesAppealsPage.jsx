// =============================================
// pages/AdminLeavesAppealsPage.jsx — Admin Leaves & Appeals Management (Reworked)
// =============================================

import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";

// ── Helpers ───────────────────────────────────────────────────────────────────

function format12Hour(time24) {
  if (!time24) return "—";
  const [h, m] = time24.split(":");
  const hour = parseInt(h, 10);
  const period = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 === 0 ? 12 : hour % 12}:${m} ${period}`;
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// ── Status Badges ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-rose-50 text-rose-700 border-rose-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize tracking-wide ${map[status] ?? map.pending}`}>
      {status}
    </span>
  );
}

function RevalidationBadge({ status }) {
  if (!status) return null;
  const map = {
    pending: "bg-blue-50 text-blue-700 border-blue-200",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    missed: "bg-rose-50 text-rose-700 border-rose-200",
  };
  const labels = { pending: "Re-validate Pending", completed: "Re-validated ✓", missed: "Missed Re-validation" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${map[status] ?? ""}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ user }) {
  // Ghost avatar for deleted / null users
  if (!user || user.isDeleted) {
    return (
      <div className="h-9 w-9 rounded-full bg-slate-300 flex items-center justify-center text-slate-500 flex-shrink-0" title="Deleted user">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </div>
    );
  }
  const initials = user.name?.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() ?? "?";
  const src = user.profileImageUrl || (user.profileImage ? `/${user.profileImage}` : null);
  const [broken, setBroken] = useState(false);

  if (src && !broken) {
    return <img src={src} alt={user.name} onError={() => setBroken(true)} className="h-9 w-9 rounded-full object-cover border border-slate-200 flex-shrink-0" />;
  }
  return (
    <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
      {initials}
    </div>
  );
}

/** Small badge shown next to the name when a user has been soft-deleted. */
function DeletedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      Deleted
    </span>
  );
}

// ── Appeal Action Modal ───────────────────────────────────────────────────────

function AppealActionModal({ appeal, onClose, onDone }) {
  const [mode, setMode] = useState(null);
  const [adminResponse, setAdminResponse] = useState("");
  const [appealDate] = useState(appeal.date);
  const [appealStartTime, setAppealStartTime] = useState("");
  const [appealEndTime, setAppealEndTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function validateRevalidation() {
    if (!appealDate) return "Appeal date is required.";
    if (!appealStartTime) return "Re-validation start time is required.";
    if (!appealEndTime) return "Re-validation end time is required.";
    if (appealStartTime >= appealEndTime) return "Start time must be earlier than end time.";
    return null;
  }

  async function submit() {
    setError(null);
    let payload;
    if (mode === "approve") {
      payload = { status: "approved", adminResponse: adminResponse || undefined };
    } else if (mode === "revalidate") {
      const err = validateRevalidation();
      if (err) { setError(err); return; }
      payload = { status: "approved", requiresRevalidation: true, appealDate, appealStartTime, appealEndTime, adminResponse: adminResponse || undefined };
    } else {
      payload = { status: "rejected", adminResponse: adminResponse || undefined };
    }
    setSaving(true);
    try {
      await api.put(`/appeals/${appeal._id}/status`, payload);
      onDone();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update appeal.");
    } finally {
      setSaving(false);
    }
  }

  const modeLabels = {
    approve: { title: "Approve Appeal", cta: "Approve", ctaClass: "bg-emerald-600 hover:bg-emerald-700 text-white" },
    revalidate: { title: "Approve with Re-validation", cta: "Approve & Set Window", ctaClass: "bg-blue-600 hover:bg-blue-700 text-white" },
    reject: { title: "Reject Appeal", cta: "Reject", ctaClass: "bg-rose-600 hover:bg-rose-700 text-white" },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <Avatar user={appeal.userId} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-900">
                  {appeal.userId?.name ?? "Deleted User"}
                </p>
                {(!appeal.userId || appeal.userId.isDeleted) && <DeletedBadge />}
              </div>
              <p className="text-xs text-slate-500">{appeal.userId?.email ?? "—"}</p>
              <p className="mt-0.5 text-xs text-slate-400">Appeal for <span className="font-medium text-slate-600">{formatDate(appeal.date)}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Employee's Reason</p>
          <p className="text-sm text-slate-700 leading-relaxed">{appeal.reason}</p>
        </div>

        {!mode ? (
          <div className="px-6 py-5 space-y-3">
            <p className="text-sm font-medium text-slate-700 mb-1">Choose an action:</p>
            {[
              { key: "approve", icon: "✓", color: "emerald", title: "Approve — Mark Present Immediately", desc: "Accept the appeal and set attendance status to PRESENT right now." },
              { key: "revalidate", icon: "⏱", color: "blue", title: "Approve with Re-validation", desc: "Require re-marking within a custom window. Penalty if missed." },
              { key: "reject", icon: "✕", color: "rose", title: "Reject Appeal", desc: "Deny the appeal. Attendance stays absent and a penalty is applied." },
            ].map(({ key, icon, color, title, desc }) => (
              <button key={key} onClick={() => setMode(key)}
                className={`flex w-full items-start gap-3 rounded-2xl border border-${color}-200 bg-${color}-50 px-4 py-3 text-left hover:bg-${color}-100 transition-colors`}>
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-${color}-600 text-white text-xs`}>{icon}</span>
                <div>
                  <p className={`text-sm font-semibold text-${color}-800`}>{title}</p>
                  <p className={`text-xs text-${color}-600 mt-0.5`}>{desc}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => { setMode(null); setError(null); }} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <span className="text-slate-300">/</span>
              <p className="text-sm font-semibold text-slate-700">{modeLabels[mode]?.title}</p>
            </div>

            {mode === "revalidate" && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 space-y-4">
                <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Re-validation Window</p>
                <div>
                  <label className="block text-xs font-medium text-blue-700 mb-1.5">Re-validation Date</label>
                  <input type="date" className="input-field max-w-xs bg-slate-100 cursor-not-allowed text-slate-500 font-semibold" value={appealDate} readOnly />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-blue-700 mb-1.5">Start Time</label>
                    <input type="time" className="input-field w-full" value={appealStartTime} onChange={(e) => setAppealStartTime(e.target.value)} required />
                    {appealStartTime && <p className="mt-1 text-xs text-blue-600">{format12Hour(appealStartTime)}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-blue-700 mb-1.5">End Time</label>
                    <input type="time" className="input-field w-full" value={appealEndTime} onChange={(e) => setAppealEndTime(e.target.value)} required />
                    {appealEndTime && <p className="mt-1 text-xs text-blue-600">{format12Hour(appealEndTime)}</p>}
                  </div>
                </div>
                {appealStartTime && appealEndTime && appealStartTime >= appealEndTime && (
                  <p className="text-xs text-rose-600 font-medium">⚠ Start time must be before end time.</p>
                )}
                <p className="text-xs text-blue-600 leading-relaxed">
                  The user must mark attendance via face + location within this window. If they miss it, attendance will be <strong>Absent + Penalty</strong>.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Admin Response <span className="text-slate-400 font-normal">(optional)</span></label>
              <textarea className="input-field w-full resize-none" rows={3}
                placeholder={mode === "reject" ? "Reason for rejection..." : "Note for the employee..."}
                value={adminResponse} onChange={(e) => setAdminResponse(e.target.value)} />
            </div>

            {error && <p className="text-sm text-rose-600 font-medium bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">{error}</p>}

            <div className="flex items-center gap-3 pt-1">
              <button onClick={submit} disabled={saving}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${modeLabels[mode]?.ctaClass}`}>
                {saving ? "Processing…" : modeLabels[mode]?.cta}
              </button>
              <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bulk Confirm Modal ────────────────────────────────────────────────────────

function BulkConfirmModal({ confirm, count, itemType, processing, error, onExecute, onClose }) {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [localError, setLocalError] = useState(null);

  const isRevalidate = confirm.action === "revalidate";
  const isApprove = confirm.action === "approved";

  const label = isRevalidate ? "Re-validate All" : isApprove ? "Approve All" : "Reject All";
  const noun = itemType === "appeals" ? (count === 1 ? "Appeal" : "Appeals") : (count === 1 ? "Leave" : "Leaves");

  const ctaClass = isRevalidate
    ? "bg-blue-600 hover:bg-blue-700"
    : isApprove
      ? "bg-emerald-600 hover:bg-emerald-700"
      : "bg-rose-600 hover:bg-rose-700";

  function handleConfirm() {
    setLocalError(null);
    if (isRevalidate) {
      if (!startTime) { setLocalError("Start time is required."); return; }
      if (!endTime) { setLocalError("End time is required."); return; }
      if (startTime >= endTime) { setLocalError("Start time must be before end time."); return; }
      onExecute({ startTime, endTime });
    } else {
      onExecute(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-slate-100">
          <div>
            <p className="section-label">Bulk Action</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              {label} — {count} {noun}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isRevalidate
                ? `Set a shared re-validation time window for all ${count} selected ${noun.toLowerCase()}. Each appeal will use its own date.`
                : `This will ${isApprove ? "approve" : "reject"} all ${count} selected ${itemType === "appeals" ? "appeals" : "leave requests"} at once. This action cannot be undone.`}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Re-validation time window */}
        {isRevalidate && (
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
            <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-3">Shared Re-validation Window</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-blue-700 mb-1.5">Start Time</label>
                <input type="time" className="input-field w-full" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                {startTime && <p className="mt-1 text-xs text-blue-600">{format12Hour(startTime)}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-blue-700 mb-1.5">End Time</label>
                <input type="time" className="input-field w-full" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                {endTime && <p className="mt-1 text-xs text-blue-600">{format12Hour(endTime)}</p>}
              </div>
            </div>
            <p className="mt-3 text-xs text-blue-600 leading-relaxed">
              Each employee must re-mark attendance via face + location within this window on <strong>their own appeal date</strong>. Missing it results in <strong>Absent + Penalty</strong>.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 py-4 space-y-3">
          {(error || localError) && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">{localError || error}</p>
          )}
          <div className="flex items-center gap-3">
            <button onClick={handleConfirm} disabled={processing} className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${ctaClass}`}>
              {processing ? "Processing…" : label}
            </button>
            <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AdminLeavesAppealsPage() {
  const [type, setType] = useState("appeals");         // "appeals" | "leaves"
  const [statusTab, setStatusTab] = useState("pending"); // "pending" | "approved" | "rejected"
  const [leaves, setLeaves] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [selectedAppeal, setSelectedAppeal] = useState(null);
  const [leafConfirm, setLeafConfirm] = useState(null);
  const [leafSubmitting, setLeafSubmitting] = useState(false);
  const [leafError, setLeafError] = useState(null);

  // ── Bulk selection ────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(null); // { action: "approved"|"rejected" }
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkError, setBulkError] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deptFilter, setDeptFilter] = useState("");

  // Fetch all data on mount
  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      try {
        const [leavesRes, appealsRes] = await Promise.all([
          api.get("/leaves/all"),
          api.get("/appeals/all"),
        ]);
        setLeaves(leavesRes.data);
        setAppeals(appealsRes.data);
      } catch {
        // silently ignore
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  async function refetch() {
    try {
      const [leavesRes, appealsRes] = await Promise.all([
        api.get("/leaves/all"),
        api.get("/appeals/all"),
      ]);
      setLeaves(leavesRes.data);
      setAppeals(appealsRes.data);
    } catch {
      // silently ignore
    }
  }

  // Leaf approve/reject inline
  function startLeafAction(leave, actionStatus) {
    setLeafError(null);
    setLeafConfirm({ id: leave._id, name: leave.userId?.name ?? "this user", actionStatus, reason: "" });
  }

  async function confirmLeafAction() {
    if (!leafConfirm) return;
    setLeafSubmitting(true);
    setLeafError(null);
    try {
      await api.put(`/leaves/${leafConfirm.id}/status`, {
        status: leafConfirm.actionStatus,
        adminResponse: leafConfirm.reason || undefined,
      });
      setLeafConfirm(null);
      refetch();
    } catch (err) {
      setLeafError(err.response?.data?.message || "Failed to update leave.");
    } finally {
      setLeafSubmitting(false);
    }
  }

  // ── Derived all-dept list ────────────────────────────────────────────────────
  const allDepts = useMemo(() => {
    const source = type === "appeals" ? appeals : leaves;
    return [...new Set(source.map((r) => r.userId?.department).filter(Boolean))].sort();
  }, [appeals, leaves, type]);

  // ── Apply filters + status tab ────────────────────────────────────────────────
  const filteredList = useMemo(() => {
    const source = type === "appeals" ? appeals : leaves;
    return source.filter((r) => {
      if (r.status !== statusTab) return false;
      const q = search.trim().toLowerCase();
      if (q) {
        const name = r.userId?.name?.toLowerCase() ?? "";
        const email = r.userId?.email?.toLowerCase() ?? "";
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      if (deptFilter && r.userId?.department !== deptFilter) return false;
      const d = r.date ?? "";
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [appeals, leaves, type, statusTab, search, deptFilter, dateFrom, dateTo]);

  // ── Counts ───────────────────────────────────────────────────────────────────
  const source = type === "appeals" ? appeals : leaves;
  const counts = {
    pending: source.filter((r) => r.status === "pending").length,
    approved: source.filter((r) => r.status === "approved").length,
    rejected: source.filter((r) => r.status === "rejected").length,
  };

  const hasFilters = search || deptFilter || dateFrom || dateTo;

  // ── Bulk selection helpers ────────────────────────────────────────────────────
  // Only pending rows are selectable
  const selectablePendingIds = useMemo(
    () => filteredList.filter((r) => r.status === "pending").map((r) => r._id),
    [filteredList]
  );
  const allSelected = selectablePendingIds.length > 0 && selectablePendingIds.every((id) => selectedIds.has(id));
  const someSelected = selectablePendingIds.some((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        selectablePendingIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        selectablePendingIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function toggleOne(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkError(null);
  }

  async function executeBulkAction(action, revalTimes) {
    setBulkProcessing(true);
    setBulkError(null);
    const ids = [...selectedIds];
    const endpoint = type === "appeals" ? "/appeals" : "/leaves";

    // Build per-item payloads
    const buildPayload = (id) => {
      if (action === "revalidate") {
        // Each appeal has its own date; look it up from filteredList
        const appeal = filteredList.find((r) => r._id === id);
        return {
          status: "approved",
          requiresRevalidation: true,
          appealDate: appeal?.date,
          appealStartTime: revalTimes.startTime,
          appealEndTime: revalTimes.endTime,
        };
      }
      return { status: action };
    };

    try {
      await Promise.all(ids.map((id) => api.put(`${endpoint}/${id}/status`, buildPayload(id))));
      setBulkConfirm(null);
      clearSelection();
      refetch();
    } catch (err) {
      setBulkError(err.response?.data?.message || "One or more updates failed.");
    } finally {
      setBulkProcessing(false);
    }
  }

  // Clear selection when switching type or tab
  function switchType(key) {
    setType(key);
    setStatusTab("pending");
    setSearch(""); setDeptFilter(""); setDateFrom(""); setDateTo("");
    clearSelection();
  }

  function switchTab(key) {
    setStatusTab(key);
    clearSelection();
  }

  return (
    <PageWrapper
      title="Leaves & Appeals"
      description="Manage employee leave requests and auto-absent cutoff appeals."
    >
      {/* ── Appeal modal ── */}
      {selectedAppeal && (
        <AppealActionModal
          appeal={selectedAppeal}
          onClose={() => setSelectedAppeal(null)}
          onDone={() => { setSelectedAppeal(null); refetch(); }}
        />
      )}

      {/* ── Bulk confirm modal ── */}
      {bulkConfirm && (
        <BulkConfirmModal
          confirm={bulkConfirm}
          count={selectedIds.size}
          itemType={type}
          processing={bulkProcessing}
          error={bulkError}
          onExecute={(revalTimes) => executeBulkAction(bulkConfirm.action, revalTimes)}
          onClose={() => { setBulkConfirm(null); setBulkError(null); }}
        />
      )}

      {/* ── Leaf confirm modal ── */}
      {leafConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-slate-100">
              <div>
                <p className="section-label">{leafConfirm.actionStatus === "approved" ? "Approve Leave" : "Reject Leave"}</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{leafConfirm.name}</h2>
              </div>
              <button onClick={() => { setLeafConfirm(null); setLeafError(null); }} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Admin Note <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea className="input-field resize-none" rows={3}
                  placeholder={leafConfirm.actionStatus === "rejected" ? "Reason for rejection..." : "Note for employee..."}
                  value={leafConfirm.reason}
                  onChange={(e) => setLeafConfirm((prev) => ({ ...prev, reason: e.target.value }))} />
              </div>
              {leafError && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">{leafError}</p>}
              <div className="flex items-center gap-3">
                <button onClick={confirmLeafAction} disabled={leafSubmitting}
                  className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${leafConfirm.actionStatus === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>
                  {leafSubmitting ? "Processing…" : leafConfirm.actionStatus === "approved" ? "Approve" : "Reject"}
                </button>
                <button onClick={() => { setLeafConfirm(null); setLeafError(null); }} className="btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-5">
        {/* ── Type switcher ── */}
        <div className="flex gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 w-fit">
          {[
            { key: "appeals", label: "Cutoff Appeals" },
            { key: "leaves", label: "Leave Requests" },
          ].map(({ key, label }) => {
            const total = (key === "appeals" ? appeals : leaves).filter((r) => r.status === "pending").length;
            return (
              <button key={key} onClick={() => switchType(key)}
                className={`flex items-center gap-2 rounded-xl py-2 px-4 text-sm font-medium transition-all ${type === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {label}
                {total > 0 && (
                  <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-bold ${type === key ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>
                    {total}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Filters bar ── */}
        <div className="card py-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* User search */}
            <div className="relative min-w-[200px] flex-1">
              <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 16.65a7.5 7.5 0 0012.15 0z" />
              </svg>
              <input type="text" className="input-field pl-10" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            {/* Department */}
            <select className="input-field w-auto" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="">All departments</option>
              {allDepts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>

            {/* Date range */}
            <div className="flex items-center gap-2">
              <input type="date" className="input-field w-auto" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Request date from" />
              <span className="text-xs text-slate-400 flex-shrink-0">to</span>
              <input type="date" className="input-field w-auto" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Request date to" />
            </div>

            {hasFilters && (
              <button onClick={() => { setSearch(""); setDeptFilter(""); setDateFrom(""); setDateTo(""); }} className="btn-secondary text-sm">
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── Status tabs ── */}
        <div className="card overflow-hidden p-0">
          {/* Status tab bar */}
          <div className="flex border-b border-slate-100">
            {[
              { key: "pending", label: "Pending", color: "amber" },
              { key: "approved", label: "Approved", color: "emerald" },
              { key: "rejected", label: "Rejected", color: "rose" },
            ].map(({ key, label, color }) => {
              const count = counts[key];
              const active = statusTab === key;
              return (
                <button key={key} onClick={() => switchTab(key)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${active ? `border-${color}-500 text-${color}-700` : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-200"}`}>
                  {label}
                  <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-bold ${active ? `bg-${color}-100 text-${color}-700` : "bg-slate-100 text-slate-500"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-3 pr-4">
              {/* Select‑All checkbox (only shown on pending tab) */}
              {statusTab === "pending" && selectablePendingIds.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 accent-slate-800 cursor-pointer"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={toggleSelectAll}
                  />
                  <span className="text-xs text-slate-500 font-medium">Select all</span>
                </label>
              )}
              <span className="text-xs text-slate-400">
                {filteredList.length} {filteredList.length === 1 ? "record" : "records"}
                {hasFilters && " (filtered)"}
              </span>
            </div>
          </div>

          {/* ── Bulk action bar ── */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between gap-4 border-b border-amber-100 bg-amber-50 px-6 py-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-amber-500 px-2 text-xs font-bold text-white">
                  {selectedIds.size}
                </span>
                <p className="text-sm font-medium text-amber-900">
                  {selectedIds.size === 1 ? "item" : "items"} selected
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setBulkError(null); setBulkConfirm({ action: "approved" }); }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Approve All
                </button>
                {/* Re-validate All — appeals only */}
                {type === "appeals" && (
                  <button
                    onClick={() => { setBulkError(null); setBulkConfirm({ action: "revalidate" }); }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                    </svg>
                    Re-validate All
                  </button>
                )}
                <button
                  onClick={() => { setBulkError(null); setBulkConfirm({ action: "rejected" }); }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reject All
                </button>
                <button
                  onClick={clearSelection}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="divide-y divide-slate-100">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-4 px-6 py-5">
                    <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200 flex-shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-3.5 w-40 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-56 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredList.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-slate-500">
                  No {statusTab} {type === "appeals" ? "appeals" : "leave requests"} found.
                </p>
                {hasFilters && (
                  <button onClick={() => { setSearch(""); setDeptFilter(""); setDateFrom(""); setDateTo(""); }}
                    className="mt-3 text-sm font-semibold text-blue-600 hover:underline">
                    Clear filters
                  </button>
                )}
              </div>
            ) : type === "appeals" ? (
              /* ── Appeal rows ── */
              filteredList.map((appeal) => {
                const isPending = appeal.status === "pending";
                const isChecked = selectedIds.has(appeal._id);
                return (
                  <div
                    key={appeal._id}
                    className={`flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-start sm:justify-between transition-colors ${isChecked ? "bg-amber-50/60" : "hover:bg-slate-50"
                      }`}
                  >
                    {/* Checkbox */}
                    <div className="flex items-start gap-3 min-w-0">
                      {isPending && (
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 flex-shrink-0 rounded border-slate-300 accent-slate-800 cursor-pointer"
                          checked={isChecked}
                          onChange={() => toggleOne(appeal._id)}
                        />
                      )}
                      <Avatar user={appeal.userId} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-sm text-slate-900">
                            {appeal.userId?.name ?? "Deleted User"}
                          </p>
                          {(!appeal.userId || appeal.userId.isDeleted) && <DeletedBadge />}
                          {appeal.userId?.department && (
                            <span className="status-chip bg-slate-100 text-slate-600">{appeal.userId.department}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{appeal.userId?.email ?? "—"}</p>
                        <p className="mt-2 text-xs text-slate-600">
                          <span className="font-medium">Appeal date:</span> {formatDate(appeal.date)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 line-clamp-2" title={appeal.reason}>
                          <span className="font-medium text-slate-600">Reason:</span> {appeal.reason}
                        </p>
                        {appeal.adminResponse && (
                          <p className="mt-1 text-xs text-slate-400 italic">Admin: {appeal.adminResponse}</p>
                        )}
                        {appeal.requiresRevalidation && (
                          <div className="mt-2 rounded-xl bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
                            Re-validate on <strong>{formatDate(appeal.appealDate)}</strong> between{" "}
                            <strong>{format12Hour(appeal.appealStartTime)}</strong> and{" "}
                            <strong>{format12Hour(appeal.appealEndTime)}</strong>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-start sm:items-end gap-2 flex-shrink-0">
                      <div className="flex flex-wrap gap-2">
                        <StatusBadge status={appeal.status} />
                        {appeal.requiresRevalidation && <RevalidationBadge status={appeal.revalidationStatus} />}
                      </div>
                      {isPending && (
                        <button onClick={() => setSelectedAppeal(appeal)}
                          className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition-colors">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Review
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              /* ── Leave rows ── */
              filteredList.map((leave) => {
                const isPending = leave.status === "pending";
                const isChecked = selectedIds.has(leave._id);
                return (
                  <div
                    key={leave._id}
                    className={`flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-start sm:justify-between transition-colors ${isChecked ? "bg-amber-50/60" : "hover:bg-slate-50"
                      }`}
                  >
                    {/* Checkbox */}
                    <div className="flex items-start gap-3 min-w-0">
                      {isPending && (
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 flex-shrink-0 rounded border-slate-300 accent-slate-800 cursor-pointer"
                          checked={isChecked}
                          onChange={() => toggleOne(leave._id)}
                        />
                      )}
                      <Avatar user={leave.userId} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-sm text-slate-900">
                            {leave.userId?.name ?? "Deleted User"}
                          </p>
                          {(!leave.userId || leave.userId.isDeleted) && <DeletedBadge />}
                          {leave.userId?.department && (
                            <span className="status-chip bg-slate-100 text-slate-600">{leave.userId.department}</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{leave.userId?.email ?? "—"}</p>
                        <p className="mt-2 text-xs text-slate-600">
                          <span className="font-medium">Leave date:</span> {formatDate(leave.date)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 line-clamp-2" title={leave.reason}>
                          <span className="font-medium text-slate-600">Reason:</span> {leave.reason}
                        </p>
                        {leave.adminResponse && (
                          <p className="mt-1 text-xs text-slate-400 italic">Admin: {leave.adminResponse}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-start sm:items-end gap-2 flex-shrink-0">
                      <StatusBadge status={leave.status} />
                      {isPending && (
                        <div className="flex gap-2 mt-1">
                          <button onClick={() => startLeafAction(leave, "approved")}
                            className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors">
                            Approve
                          </button>
                          <button onClick={() => startLeafAction(leave, "rejected")}
                            className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors">
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
