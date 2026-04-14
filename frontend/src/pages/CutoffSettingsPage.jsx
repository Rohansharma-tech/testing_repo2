// =============================================
// pages/CutoffSettingsPage.jsx — Attendance Window Settings (Work Start + Work End)
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
    purple: "bg-purple-50 text-purple-700 ring-purple-200",
    rose: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  const dotMap = {
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    blue: "bg-blue-500",
    purple: "bg-purple-500",
    slate: "bg-slate-400",
    rose: "bg-rose-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${colorMap[color] ?? colorMap.slate}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotMap[color] ?? dotMap.slate}`} />
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

function Toggle({ id, checked, onChange, label }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          checked ? "bg-blue-600" : "bg-slate-200"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <span className="text-sm font-medium text-slate-700">{label}</span>
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

// ── Session Card ───────────────────────────────────────────────────────────────

function SessionCard({ title, accentColor, fields, toggle, onSubmit, saving, validationError, children }) {
  const accent = {
    blue: "border-blue-200 bg-blue-50",
    indigo: "border-indigo-200 bg-indigo-50",
  }[accentColor] || "border-slate-200 bg-slate-50";

  return (
    <section className="card">
      <div className={`-mx-6 -mt-6 mb-6 flex items-center gap-3 rounded-t-3xl border-b px-6 py-4 ${accent}`}>
        <div>
          <p className="section-label">{title}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          {fields}
        </div>
        {validationError && (
          <p className="text-xs text-rose-600 font-medium">{validationError}</p>
        )}
        {toggle}
        {children}
        <div className="pt-2">
          <button
            type="submit"
            disabled={saving || Boolean(validationError)}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? "Saving..." : `Save ${title}`}
          </button>
        </div>
      </form>
    </section>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function CutoffSettingsPage() {
  // ── Server state ────────────────────────────────────────────────────────────
  const [window_, setWindow_] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Work Start (morning) form state ──────────────────────────────────────
  const [morningStart, setMorningStart] = useState("");
  const [morningEnd, setMorningEnd] = useState("");
  const [morningCutoffEnabled, setMorningCutoffEnabled] = useState(true);
  const [savingMorning, setSavingMorning] = useState(false);

  // ── Work End (evening) form state ────────────────────────────────────────
  const [eveningStart, setEveningStart] = useState("");
  const [eveningEnd, setEveningEnd] = useState("");
  const [eveningCutoffEnabled, setEveningCutoffEnabled] = useState(false);
  const [savingEvening, setSavingEvening] = useState(false);

  // ── Legacy cutoff form state ─────────────────────────────────────────────
  const [legacyCutoffTime, setLegacyCutoffTime] = useState("");
  const [savingLegacy, setSavingLegacy] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const [showLegacy, setShowLegacy] = useState(false);

  // ── Fetch settings ──────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchSettings() {
      try {
        const [windowRes, legacyRes] = await Promise.all([
          api.get("/settings/attendance-window"),
          api.get("/settings/cutoff"),
        ]);
        const w = windowRes.data;
        setWindow_(w);
        setMorningStart(w.attendanceStartTime || "");
        setMorningEnd(w.attendanceEndTime || "");
        setMorningCutoffEnabled(w.cutoffEnabled ?? false);
        setEveningStart(w.eveningStartTime || "");
        setEveningEnd(w.eveningEndTime || "");
        setEveningCutoffEnabled(w.eveningCutoffEnabled ?? false);
        setLegacyCutoffTime(legacyRes.data.cutoffTime || "");
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

  // ── Validation ────────────────────────────────────────────────────────────
  const morningValidationError =
    morningStart && morningEnd && morningStart >= morningEnd
      ? "Work Start open time must be earlier than close time."
      : null;

  const eveningValidationError =
    eveningStart && eveningEnd && eveningStart >= eveningEnd
      ? "Work End open time must be earlier than close time."
      : morningEnd && eveningStart && morningEnd >= eveningStart
      ? "Work End open time must be after Work Start close time."
      : null;

  // ── Save Work Start window ────────────────────────────────────────────────
  async function handleSaveMorning(e) {
    e.preventDefault();
    if (morningValidationError) return;

    setSavingMorning(true);
    try {
      const res = await api.put("/settings/attendance-window", {
        attendanceStartTime: morningStart || null,
        attendanceEndTime: morningEnd || null,
        cutoffEnabled: morningCutoffEnabled,
      });
      setWindow_((prev) => ({ ...prev, ...res.data }));

      const parts = [];
      if (res.data.attendanceStartTime) parts.push(`opens at ${format12Hour(res.data.attendanceStartTime)}`);
      if (res.data.attendanceEndTime) parts.push(`closes at ${format12Hour(res.data.attendanceEndTime)}`);
      const windowStr = parts.length ? `Work Start window ${parts.join(", ")}.` : "No Work Start window set.";
      const cronStr = res.data.cutoffEnabled && res.data.scheduledCutoff
        ? ` Auto-absent fires at ${format12Hour(res.data.scheduledCutoff)}.`
        : " Work Start auto-absent disabled.";
      showToast("success", windowStr + cronStr);
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to save Work Start window.");
    } finally {
      setSavingMorning(false);
    }
  }

  // ── Save Work End window ──────────────────────────────────────────────────
  async function handleSaveEvening(e) {
    e.preventDefault();
    if (eveningValidationError) return;

    setSavingEvening(true);
    try {
      const res = await api.put("/settings/attendance-window", {
        eveningStartTime: eveningStart || null,
        eveningEndTime: eveningEnd || null,
        eveningCutoffEnabled,
      });
      setWindow_((prev) => ({ ...prev, ...res.data }));

      const parts = [];
      if (res.data.eveningStartTime) parts.push(`opens at ${format12Hour(res.data.eveningStartTime)}`);
      if (res.data.eveningEndTime) parts.push(`closes at ${format12Hour(res.data.eveningEndTime)}`);
      const windowStr = parts.length ? `Work End window ${parts.join(", ")}.` : "No Work End window set.";
      const cronStr = res.data.eveningCutoffEnabled && res.data.scheduledEveningCutoff
        ? ` Work End auto-absent fires at ${format12Hour(res.data.scheduledEveningCutoff)}.`
        : " Work End auto-absent disabled.";
      showToast("success", windowStr + cronStr);
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to save Work End window.");
    } finally {
      setSavingEvening(false);
    }
  }

  // ── Save legacy cutoff ────────────────────────────────────────────────────
  async function handleSaveLegacy(e) {
    e.preventDefault();
    if (!legacyCutoffTime) return;

    setSavingLegacy(true);
    try {
      const res = await api.put("/settings/cutoff", {
        cutoffTime: legacyCutoffTime,
        cutoffEnabled: morningCutoffEnabled,
      });
      setWindow_((prev) => ({ ...prev, scheduledCutoff: res.data.scheduledCutoff }));
      showToast("success", `Legacy cutoff set to ${format12Hour(legacyCutoffTime)}.`);
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to save legacy cutoff.");
    } finally {
      setSavingLegacy(false);
    }
  }

  // ── Disable auto-absent ───────────────────────────────────────────────────
  async function handleDisable() {
    setDisabling(true);
    setShowDisableConfirm(false);
    try {
      await api.delete("/settings/cutoff");
      setWindow_((prev) => ({ ...prev, cutoffEnabled: false, scheduledCutoff: null }));
      setMorningCutoffEnabled(false);
      showToast("success", "Work Start auto-absent has been disabled.");
    } catch {
      showToast("error", "Failed to disable auto-absent.");
    } finally {
      setDisabling(false);
    }
  }

  return (
    <PageWrapper
      title="Attendance Settings"
      description="Configure Work Start and Work End attendance windows. Users must mark attendance once per session."
    >
      <div className="space-y-6 max-w-2xl">
        <Toast toast={toast} />

        {/* ── Current Status Overview ── */}
        <section className="card">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="section-label">Current Configuration</p>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">Attendance Windows</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {!loading && (
                <>
                  <StatusPill
                    label={
                      window_?.cutoffEnabled && window_?.scheduledCutoff
                        ? `Work Start cron: ${format12Hour(window_.scheduledCutoff)}`
                        : window_?.attendanceStartTime || window_?.attendanceEndTime
                        ? "Work Start set — no cron"
                        : "Work Start not set"
                    }
                    color={
                      window_?.cutoffEnabled && window_?.scheduledCutoff
                        ? "green"
                        : window_?.attendanceStartTime || window_?.attendanceEndTime
                        ? "blue"
                        : "slate"
                    }
                  />
                  <StatusPill
                    label={
                      window_?.eveningCutoffEnabled && window_?.scheduledEveningCutoff
                        ? `Work End cron: ${format12Hour(window_.scheduledEveningCutoff)}`
                        : window_?.eveningStartTime || window_?.eveningEndTime
                        ? "Work End set — no cron"
                        : "Work End not set"
                    }
                    color={
                      window_?.eveningCutoffEnabled && window_?.scheduledEveningCutoff
                        ? "purple"
                        : window_?.eveningStartTime || window_?.eveningEndTime
                        ? "blue"
                        : "slate"
                    }
                  />
                </>
              )}
            </div>
          </div>

          {loading ? (
            <div className="mt-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-4 w-full animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="mt-6 grid sm:grid-cols-2 gap-4">
              {/* Work Start summary */}
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-3">Work Start Session</p>
                <InfoRow label="Open" value={window_?.attendanceStartTime ? format12Hour(window_.attendanceStartTime) : "Not set"} />
                <InfoRow label="Close" value={window_?.attendanceEndTime ? format12Hour(window_.attendanceEndTime) : "Not set"} />
                <InfoRow label="Auto-absent" value={window_?.cutoffEnabled ? (window_?.scheduledCutoff ? `Fires at ${format12Hour(window_.scheduledCutoff)}` : "Enabled") : "Disabled"} />
              </div>
              {/* Work End summary */}
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700 mb-3">Work End Session</p>
                <InfoRow label="Open" value={window_?.eveningStartTime ? format12Hour(window_.eveningStartTime) : "Not set"} />
                <InfoRow label="Close" value={window_?.eveningEndTime ? format12Hour(window_.eveningEndTime) : "Not set"} />
                <InfoRow label="Auto-absent" value={window_?.eveningCutoffEnabled ? (window_?.scheduledEveningCutoff ? `Fires at ${format12Hour(window_.scheduledEveningCutoff)}` : "Enabled") : "Disabled"} />
              </div>
            </div>
          )}

          <div className="mt-4">
            <InfoRow label="Timezone" value={window_?.cutoffTimeZone} />
            <InfoRow
              label="Last Updated"
              value={
                window_?.updatedAt
                  ? new Date(window_.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                  : "Never"
              }
            />
          </div>
        </section>


        {/* ── Work Start Session Form ── */}
        <SessionCard
          title="Work Start Session"
          accentColor="blue"
          saving={savingMorning}
          onSubmit={handleSaveMorning}
          validationError={morningValidationError}
          fields={
            <>
              <TimeField
                id="work-start-open-time"
                label="Window Open Time"
                hint="(earliest mark allowed)"
                value={morningStart}
                onChange={setMorningStart}
              />
              <TimeField
                id="work-start-close-time"
                label="Window Close Time"
                hint="(latest mark / cron fires here)"
                value={morningEnd}
                onChange={setMorningEnd}
              />
            </>
          }
          toggle={
            <Toggle
              id="work-start-cutoff-toggle"
              checked={morningCutoffEnabled}
              onChange={setMorningCutoffEnabled}
              label={morningCutoffEnabled ? "Work Start auto-absent enabled (fires at close time)" : "Work Start auto-absent disabled"}
            />
          }
        >
          {window_?.cutoffEnabled && (
            <div>
              {showDisableConfirm ? (
                <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5">
                  <p className="text-xs font-medium text-rose-700">Disable Work Start auto-absent?</p>
                  <button
                    type="button"
                    disabled={disabling}
                    onClick={handleDisable}
                    className="rounded-xl bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {disabling ? "Disabling..." : "Yes, disable"}
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
                  id="disable-work-start-cutoff-btn"
                  type="button"
                  disabled={disabling}
                  onClick={() => setShowDisableConfirm(true)}
                  className="btn-secondary text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
                >
                  Disable Work Start Auto-Absent
                </button>
              )}
            </div>
          )}
        </SessionCard>

        {/* ── Work End Session Form ── */}
        <SessionCard
          title="Work End Session"
          accentColor="indigo"
          saving={savingEvening}
          onSubmit={handleSaveEvening}
          validationError={eveningValidationError}
          fields={
            <>
              <TimeField
                id="work-end-open-time"
                label="Window Open Time"
                hint="(earliest mark allowed)"
                value={eveningStart}
                onChange={setEveningStart}
              />
              <TimeField
                id="work-end-close-time"
                label="Window Close Time"
                hint="(latest mark / cron fires here)"
                value={eveningEnd}
                onChange={setEveningEnd}
              />
            </>
          }
          toggle={
            <Toggle
              id="work-end-cutoff-toggle"
              checked={eveningCutoffEnabled}
              onChange={setEveningCutoffEnabled}
              label={eveningCutoffEnabled ? "Work End auto-absent enabled (fires at close time)" : "Work End auto-absent disabled"}
            />
          }
        />

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
                <span className="ml-2 text-xs font-normal text-slate-400">(used only if no Work Start Close Time is set above)</span>
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
                This legacy field is superseded by the Work Start Close Time above. Only use this if you need backward compatibility.
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
                  {savingLegacy ? "Saving..." : "Save Legacy Cutoff"}
                </button>
              </div>
            </form>
          )}
        </section>

      </div>
    </PageWrapper>
  );
}
