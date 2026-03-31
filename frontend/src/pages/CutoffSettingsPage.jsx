// =============================================
// pages/CutoffSettingsPage.jsx — Attendance Window Settings
// =============================================

import { useEffect, useState } from "react";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";

// ── Helpers ──────────────────────────────────────────────────────────────────

function format12Hour(time24) {
  if (!time24) return "";
  const [hourStr, minuteStr] = time24.split(":");
  const hour = parseInt(hourStr, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minuteStr} ${period}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ label, color }) {
  const colorMap = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    slate: "bg-slate-100 text-slate-500 ring-slate-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${colorMap[color] ?? colorMap.slate}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${color === "green" ? "bg-emerald-500" : color === "amber" ? "bg-amber-500" : color === "blue" ? "bg-blue-500" : "bg-slate-400"}`} />
      {label}
    </span>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-900 text-right">{value || "—"}</p>
    </div>
  );
}

function TimeField({ id, label, hint, value, onChange, required = false }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {hint && <span className="ml-1.5 text-slate-400 font-normal">{hint}</span>}
      </label>
      <input
        id={id}
        type="time"
        className="input-field max-w-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      {value && (
        <p className="mt-1.5 text-xs text-slate-500">
          Displayed as: <span className="font-medium text-slate-700">{format12Hour(value)}</span>
        </p>
      )}
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const isSuccess = toast.type === "success";
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border p-4 text-sm font-medium ${
        isSuccess ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {isSuccess ? (
        <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {toast.message}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CutoffSettingsPage() {
  // ── Server state ────────────────────────────────────────────────────────────
  const [window_, setWindow_] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Window form state ────────────────────────────────────────────────────────
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [cutoffEnabled, setCutoffEnabled] = useState(true);
  const [savingWindow, setSavingWindow] = useState(false);

  // ── Legacy cutoff form state ────────────────────────────────────────────────
  const [legacyCutoffTime, setLegacyCutoffTime] = useState("");
  const [savingLegacy, setSavingLegacy] = useState(false);
  const [disabling, setDisabling] = useState(false);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  // ── Fetch settings ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchSettings() {
      try {
        const [windowRes, legacyRes] = await Promise.all([
          api.get("/settings/attendance-window"),
          api.get("/settings/cutoff"),
        ]);
        const w = windowRes.data;
        setWindow_(w);
        setStartTime(w.attendanceStartTime || "");
        setEndTime(w.attendanceEndTime || "");
        setCutoffEnabled(w.cutoffEnabled ?? true);

        const l = legacyRes.data;
        setLegacyCutoffTime(l.cutoffTime || "");
      } catch {
        showToast("error", "Failed to load attendance settings.");
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  }

  // ── Validate cross-field ─────────────────────────────────────────────────────
  function validateWindow() {
    if (startTime && endTime && startTime >= endTime) {
      showToast("error", "Start time must be earlier than end time.");
      return false;
    }
    return true;
  }

  // ── Save attendance window ───────────────────────────────────────────────────
  async function handleSaveWindow(e) {
    e.preventDefault();
    if (!validateWindow()) return;

    setSavingWindow(true);
    try {
      const payload = {
        attendanceStartTime: startTime || null,
        attendanceEndTime: endTime || null,
        cutoffEnabled,
      };
      const res = await api.put("/settings/attendance-window", payload);
      setWindow_((prev) => ({ ...prev, ...res.data }));

      const parts = [];
      if (res.data.attendanceStartTime) parts.push(`opens at ${format12Hour(res.data.attendanceStartTime)}`);
      if (res.data.attendanceEndTime) parts.push(`closes at ${format12Hour(res.data.attendanceEndTime)}`);
      const windowStr = parts.length ? `Window ${parts.join(", ")}.` : "No window boundaries set.";
      const cronStr = res.data.cutoffEnabled && res.data.scheduledCutoff
        ? ` Auto-absent fires at ${format12Hour(res.data.scheduledCutoff)}.`
        : " Auto-absent is disabled.";

      showToast("success", windowStr + cronStr);
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to save attendance window.");
    } finally {
      setSavingWindow(false);
    }
  }

  // ── Save legacy cutoff ───────────────────────────────────────────────────────
  async function handleSaveLegacy(e) {
    e.preventDefault();
    if (!legacyCutoffTime) return;

    setSavingLegacy(true);
    try {
      const res = await api.put("/settings/cutoff", {
        cutoffTime: legacyCutoffTime,
        cutoffEnabled,
      });
      setWindow_((prev) => ({ ...prev, scheduledCutoff: res.data.scheduledCutoff }));
      showToast("success", `Legacy cutoff set to ${format12Hour(legacyCutoffTime)}.`);
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to save legacy cutoff.");
    } finally {
      setSavingLegacy(false);
    }
  }

  // ── Disable auto-absent ──────────────────────────────────────────────────────
  async function handleDisable() {
    setDisabling(true);
    setShowDisableConfirm(false);
    try {
      await api.delete("/settings/cutoff");
      setWindow_((prev) => ({ ...prev, cutoffEnabled: false, scheduledCutoff: null }));
      setCutoffEnabled(false);
      showToast("success", "Auto-absent has been disabled.");
    } catch {
      showToast("error", "Failed to disable auto-absent.");
    } finally {
      setDisabling(false);
    }
  }

  // ── Derived status info ──────────────────────────────────────────────────────
  function getWindowStatusPill() {
    if (!window_) return <StatusPill label="Loading..." color="slate" />;
    const hasBoth = window_.attendanceStartTime && window_.attendanceEndTime;
    const hasEnd = Boolean(window_.attendanceEndTime);
    if (!hasBoth && !hasEnd) return <StatusPill label="Not Configured" color="slate" />;
    if (window_.cutoffEnabled && window_.scheduledCutoff)
      return <StatusPill label={`Active — cron at ${format12Hour(window_.scheduledCutoff)}`} color="green" />;
    if (window_.cutoffEnabled)
      return <StatusPill label="Enabled — restart to activate cron" color="amber" />;
    return <StatusPill label="Window set — auto-absent disabled" color="blue" />;
  }

  return (
    <PageWrapper
      title="Attendance Settings"
      description="Configure when attendance can be marked and when the auto-absent job fires."
    >
      <div className="space-y-6 max-w-2xl">
        <Toast toast={toast} />

        {/* ── Current Status ── */}
        <section className="card">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="section-label">Auto-Absent Status</p>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">Attendance Window</h2>
            </div>
            {!loading && getWindowStatusPill()}
          </div>

          {loading ? (
            <div className="mt-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-4 w-full animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="mt-6">
              <InfoRow
                label="Attendance Start"
                value={window_?.attendanceStartTime ? format12Hour(window_.attendanceStartTime) : "Not set (no start restriction)"}
              />
              <InfoRow
                label="Attendance End"
                value={window_?.attendanceEndTime ? format12Hour(window_.attendanceEndTime) : "Not set (no end restriction)"}
              />
              <InfoRow label="Timezone" value={window_?.cutoffTimeZone} />
              <InfoRow
                label="Auto-Absent Cron"
                value={
                  window_?.cutoffEnabled && window_?.scheduledCutoff
                    ? `Firing daily at ${format12Hour(window_.scheduledCutoff)}`
                    : window_?.cutoffEnabled
                    ? "Enabled — will activate on next save"
                    : "Disabled"
                }
              />
              <InfoRow
                label="Last Updated"
                value={
                  window_?.updatedAt
                    ? new Date(window_.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                    : "Never"
                }
              />
            </div>
          )}
        </section>

        {/* ── How It Works ── */}
        <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <p className="text-sm font-semibold text-blue-800">How the Attendance Window Works</p>
          <ul className="mt-3 space-y-2 text-sm text-blue-700">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-blue-400">→</span>
              <b>Start Time:</b> Users attempting to mark attendance before this time are blocked until the window opens.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-blue-400">→</span>
              <b>End Time:</b> Users are blocked from marking attendance after this time. The auto-absent cron fires at this time.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-blue-400">→</span>
              If neither is set, no boundary is enforced and the system uses the legacy Cutoff Time below.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-blue-400">→</span>
              Users with a pending appeal re-validation are governed by their <b>appeal-specific time window</b>, not this global one.
            </li>
          </ul>
        </section>

        {/* ── Configure Window Form ── */}
        <section className="card">
          <p className="section-label">Configure Attendance Window</p>
          <h2 className="mt-3 text-xl font-semibold text-slate-900">Set Time Boundaries</h2>
          <p className="mt-2 text-sm text-slate-500">
            Leave a field blank to remove that boundary. Changes take effect immediately.
          </p>

          <form onSubmit={handleSaveWindow} className="mt-6 space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <TimeField
                id="attendance-start-time"
                label="Start Time"
                hint="(earliest mark allowed)"
                value={startTime}
                onChange={setStartTime}
              />
              <TimeField
                id="attendance-end-time"
                label="End Time"
                hint="(latest mark / cron fires here)"
                value={endTime}
                onChange={setEndTime}
              />
            </div>

            {startTime && endTime && startTime >= endTime && (
              <p className="text-xs text-rose-600 font-medium">⚠ Start time must be earlier than end time.</p>
            )}

            {/* Auto-absent toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                id="cutoff-enabled-toggle"
                role="switch"
                aria-checked={cutoffEnabled}
                onClick={() => setCutoffEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  cutoffEnabled ? "bg-blue-600" : "bg-slate-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                    cutoffEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-sm font-medium text-slate-700">
                {cutoffEnabled ? "Auto-absent enabled (fires at end time daily)" : "Auto-absent disabled"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                id="save-window-btn"
                type="submit"
                disabled={savingWindow || (startTime && endTime && startTime >= endTime)}
                className="btn-primary disabled:opacity-50"
              >
                {savingWindow ? "Saving…" : "Save Window Settings"}
              </button>

              {window_?.cutoffEnabled && (
                showDisableConfirm ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5">
                    <p className="text-xs font-medium text-rose-700">Disable auto-absent?</p>
                    <button
                      type="button"
                      disabled={disabling}
                      onClick={handleDisable}
                      className="rounded-xl bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {disabling ? "Disabling…" : "Yes, disable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDisableConfirm(false)}
                      className="rounded-xl border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    id="disable-cutoff-btn"
                    type="button"
                    disabled={disabling}
                    onClick={() => setShowDisableConfirm(true)}
                    className="btn-secondary text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
                  >
                    Disable Auto-Absent
                  </button>
                )
              )}
            </div>
          </form>
        </section>

        {/* ── Legacy Cutoff (collapsible) ── */}
        <section className="card">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowLegacy((v) => !v)}
          >
            <div>
              <p className="section-label">Legacy Fallback</p>
              <h2 className="mt-1 text-base font-semibold text-slate-700">
                Legacy Cutoff Time
                <span className="ml-2 text-xs font-normal text-slate-400">(used only if no End Time is set above)</span>
              </h2>
            </div>
            <svg
              className={`h-5 w-5 text-slate-400 transition-transform ${showLegacy ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showLegacy && (
            <form onSubmit={handleSaveLegacy} className="mt-5 space-y-5">
              <p className="text-sm text-slate-500">
                This legacy field is superseded by the End Time above. Only use this if you need backward compatibility.
              </p>
              <TimeField
                id="legacy-cutoff-time"
                label="Legacy Cutoff Time"
                value={legacyCutoffTime}
                onChange={setLegacyCutoffTime}
                required
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  id="save-legacy-cutoff-btn"
                  type="submit"
                  disabled={savingLegacy || !legacyCutoffTime}
                  className="btn-primary disabled:opacity-50"
                >
                  {savingLegacy ? "Saving…" : "Save Legacy Cutoff"}
                </button>
              </div>
            </form>
          )}
        </section>

      </div>
    </PageWrapper>
  );
}
