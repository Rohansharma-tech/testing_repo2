// =============================================
// pages/CutoffSettingsPage.jsx — Attendance Window Settings
// =============================================

import { useEffect, useState } from "react";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";

// ── Helpers ───────────────────────────────────────────────────────────────────

function format12Hour(time24) {
  if (!time24) return "—";
  const [hourStr, minuteStr] = time24.split(":");
  const hour = parseInt(hourStr, 10);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minuteStr} ${period}`;
}

// ── Micro-components ──────────────────────────────────────────────────────────

function StatusPill({ label, color }) {
  const styles = {
    green:  "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    blue:   "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    purple: "bg-purple-50 text-purple-700 ring-1 ring-purple-200",
    slate:  "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
  };
  const dots = {
    green: "bg-emerald-500", blue: "bg-blue-500",
    purple: "bg-purple-500", slate: "bg-slate-400",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${styles[color] ?? styles.slate}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dots[color] ?? dots.slate}`} />
      {label}
    </span>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xs font-semibold text-slate-800 text-right">{value || "—"}</p>
    </div>
  );
}

function TimeField({ id, label, hint, value, onChange, required = false }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {hint && <span className="ml-1.5 text-slate-400 font-normal text-xs">{hint}</span>}
      </label>
      <input
        id={id}
        type="time"
        className="input-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      {value && (
        <p className="mt-1 text-xs text-slate-400">
          → <span className="font-medium text-slate-600">{format12Hour(value)}</span>
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
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          checked ? "bg-blue-600" : "bg-slate-200"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
      <span className="text-sm text-slate-600">{label}</span>
    </div>
  );
}

function InlineToast({ toast }) {
  if (!toast) return null;
  const isSuccess = toast.type === "success";
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm ${
      isSuccess ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
    }`}>
      <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        {isSuccess
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />}
      </svg>
      <span>{toast.message}</span>
    </div>
  );
}

// ── Session panel ─────────────────────────────────────────────────────────────

function SessionPanel({ title, icon, accentBorder, fields, toggle, onSubmit, saving, validationError }) {
  return (
    <section className="card flex flex-col gap-5">
      {/* Header */}
      <div className={`-mx-6 -mt-6 flex items-center gap-3 rounded-t-3xl border-b ${accentBorder} px-6 py-4`}>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/70 shadow-sm">
          {icon}
        </div>
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields}
        </div>

        {validationError && (
          <p className="text-xs font-medium text-rose-600">{validationError}</p>
        )}

        {toggle}

        <div className="pt-1">
          <button
            type="submit"
            disabled={saving || Boolean(validationError)}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? "Saving…" : `Save settings`}
          </button>
        </div>
      </form>
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CutoffSettingsPage() {
  const [window_, setWindow_] = useState(null);
  const [loading, setLoading] = useState(true);

  const [morningStart, setMorningStart] = useState("");
  const [morningEnd, setMorningEnd] = useState("");
  const [morningCutoffEnabled, setMorningCutoffEnabled] = useState(true);
  const [savingMorning, setSavingMorning] = useState(false);

  const [eveningStart, setEveningStart] = useState("");
  const [eveningEnd, setEveningEnd] = useState("");
  const [eveningCutoffEnabled, setEveningCutoffEnabled] = useState(false);
  const [savingEvening, setSavingEvening] = useState(false);

  const [legacyCutoffTime, setLegacyCutoffTime] = useState("");
  const [savingLegacy, setSavingLegacy] = useState(false);

  const [toast, setToast] = useState(null);
  const [showLegacy, setShowLegacy] = useState(false);

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

  const morningValidationError =
    morningStart && morningEnd && morningStart >= morningEnd
      ? "Window open time must be earlier than close time."
      : null;

  const eveningValidationError =
    eveningStart && eveningEnd && eveningStart >= eveningEnd
      ? "Window open time must be earlier than close time."
      : morningEnd && eveningStart && morningEnd >= eveningStart
      ? "Work End open time must be after Work Start close time."
      : null;

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
      if (res.data.attendanceStartTime) parts.push(`opens ${format12Hour(res.data.attendanceStartTime)}`);
      if (res.data.attendanceEndTime) parts.push(`closes ${format12Hour(res.data.attendanceEndTime)}`);
      showToast("success", parts.length ? `Work Start: ${parts.join(", ")}.` : "Work Start window cleared.");
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to save Work Start window.");
    } finally {
      setSavingMorning(false);
    }
  }

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
      if (res.data.eveningStartTime) parts.push(`opens ${format12Hour(res.data.eveningStartTime)}`);
      if (res.data.eveningEndTime) parts.push(`closes ${format12Hour(res.data.eveningEndTime)}`);
      showToast("success", parts.length ? `Work End: ${parts.join(", ")}.` : "Work End window cleared.");
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to save Work End window.");
    } finally {
      setSavingEvening(false);
    }
  }

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

  async function handleDisable() {
    setDisabling(true);
    setShowDisableConfirm(false);
    try {
      await api.delete("/settings/cutoff");
      setWindow_((prev) => ({ ...prev, cutoffEnabled: false, scheduledCutoff: null }));
      setMorningCutoffEnabled(false);
      showToast("success", "Work Start auto-absent disabled.");
    } catch {
      showToast("error", "Failed to disable auto-absent.");
    } finally {
      setDisabling(false);
    }
  }

  // ── Icons ─────────────────────────────────────────────────────────────────

  const SunIcon = (
    <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07-.71.71M6.34 17.66l-.71.71M17.66 17.66l-.71-.71M6.34 6.34l-.71-.71M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  );
  const MoonIcon = (
    <svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );

  return (
    <PageWrapper
      title="Attendance Settings"
      description="Configure Work Start and Work End attendance windows and automated cutoff rules."
    >
      <div className="space-y-6">
        <InlineToast toast={toast} />

        {/* ── Status overview ── */}
        <section className="card p-0 overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="section-label">Live Configuration</p>
                <h2 className="mt-1 text-base font-semibold text-slate-900">Attendance Windows</h2>
              </div>
              {!loading && (
                <div className="flex flex-wrap gap-2">
                  <StatusPill
                    label={
                      window_?.cutoffEnabled && window_?.scheduledCutoff
                        ? `Work Start cron: ${format12Hour(window_.scheduledCutoff)}`
                        : window_?.attendanceStartTime || window_?.attendanceEndTime
                        ? "Work Start — no cron"
                        : "Work Start not set"
                    }
                    color={
                      window_?.cutoffEnabled && window_?.scheduledCutoff ? "green"
                      : window_?.attendanceStartTime || window_?.attendanceEndTime ? "blue"
                      : "slate"
                    }
                  />
                  <StatusPill
                    label={
                      window_?.eveningCutoffEnabled && window_?.scheduledEveningCutoff
                        ? `Work End cron: ${format12Hour(window_.scheduledEveningCutoff)}`
                        : window_?.eveningStartTime || window_?.eveningEndTime
                        ? "Work End — no cron"
                        : "Work End not set"
                    }
                    color={
                      window_?.eveningCutoffEnabled && window_?.scheduledEveningCutoff ? "purple"
                      : window_?.eveningStartTime || window_?.eveningEndTime ? "blue"
                      : "slate"
                    }
                  />
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
              {[1, 2].map((i) => (
                <div key={i} className="p-6 space-y-3">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="h-3.5 w-full animate-pulse rounded bg-slate-100" />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
              {/* Work Start */}
              <div className="p-6">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-blue-600">Work Start</p>
                <InfoRow label="Window Opens" value={window_?.attendanceStartTime ? format12Hour(window_.attendanceStartTime) : "Not set"} />
                <InfoRow label="Window Closes" value={window_?.attendanceEndTime ? format12Hour(window_.attendanceEndTime) : "Not set"} />
                <InfoRow
                  label="Auto-absent"
                  value={window_?.cutoffEnabled
                    ? window_?.scheduledCutoff ? `Fires at ${format12Hour(window_.scheduledCutoff)}` : "Enabled"
                    : "Disabled"
                  }
                />
              </div>
              {/* Work End */}
              <div className="p-6">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-600">Work End</p>
                <InfoRow label="Window Opens" value={window_?.eveningStartTime ? format12Hour(window_.eveningStartTime) : "Not set"} />
                <InfoRow label="Window Closes" value={window_?.eveningEndTime ? format12Hour(window_.eveningEndTime) : "Not set"} />
                <InfoRow
                  label="Auto-absent"
                  value={window_?.eveningCutoffEnabled
                    ? window_?.scheduledEveningCutoff ? `Fires at ${format12Hour(window_.scheduledEveningCutoff)}` : "Enabled"
                    : "Disabled"
                  }
                />
              </div>
              {/* System */}
              <div className="p-6">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">System</p>
                <InfoRow label="Timezone" value={window_?.cutoffTimeZone || "—"} />
                <InfoRow
                  label="Last Updated"
                  value={window_?.updatedAt
                    ? new Date(window_.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                    : "Never"
                  }
                />
              </div>
            </div>
          )}
        </section>

        {/* ── Session forms side by side ── */}
        <div className="grid gap-6 xl:grid-cols-2">
          {/* Work Start */}
          <SessionPanel
            title="Work Start Session"
            accentBorder="border-blue-100 bg-blue-50/60"
            icon={SunIcon}
            onSubmit={handleSaveMorning}
            saving={savingMorning}
            validationError={morningValidationError}
            fields={
              <>
                <TimeField
                  id="work-start-open-time"
                  label="Window Opens"
                  hint="earliest mark allowed"
                  value={morningStart}
                  onChange={setMorningStart}
                />
                <TimeField
                  id="work-start-close-time"
                  label="Window Closes"
                  hint="cron fires here"
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
                label={morningCutoffEnabled ? "Auto-absent enabled at close time" : "Auto-absent disabled"}
              />
            }
          />

          {/* Work End */}
          <SessionPanel
            title="Work End Session"
            accentBorder="border-indigo-100 bg-indigo-50/60"
            icon={MoonIcon}
            onSubmit={handleSaveEvening}
            saving={savingEvening}
            validationError={eveningValidationError}
            fields={
              <>
                <TimeField
                  id="work-end-open-time"
                  label="Window Opens"
                  hint="earliest mark allowed"
                  value={eveningStart}
                  onChange={setEveningStart}
                />
                <TimeField
                  id="work-end-close-time"
                  label="Window Closes"
                  hint="cron fires here"
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
                label={eveningCutoffEnabled ? "Auto-absent enabled at close time" : "Auto-absent disabled"}
              />
            }
          />
        </div>

        {/* ── Legacy cutoff (collapsible) ── */}
        <section className="card">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setShowLegacy((v) => !v)}
          >
            <div>
              <p className="section-label">Advanced</p>
              <h2 className="mt-1 text-sm font-semibold text-slate-700">
                Legacy Cutoff Time
                <span className="ml-2 text-xs font-normal text-slate-400">
                  (fallback — only if no Work Start Close Time is set)
                </span>
              </h2>
            </div>
            <svg
              className={`h-4 w-4 text-slate-400 transition-transform ${showLegacy ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showLegacy && (
            <form onSubmit={handleSaveLegacy} className="mt-5 space-y-4">
              <p className="text-sm text-slate-500">
                This legacy field is superseded by the Work Start Close Time above. Only use this for backward compatibility.
              </p>
              <TimeField
                id="legacy-cutoff-time"
                label="Legacy Cutoff Time"
                value={legacyCutoffTime}
                onChange={setLegacyCutoffTime}
                required
              />
              <button
                id="save-legacy-cutoff-btn"
                type="submit"
                disabled={savingLegacy || !legacyCutoffTime}
                className="btn-primary disabled:opacity-50"
              >
                {savingLegacy ? "Saving…" : "Save Legacy Cutoff"}
              </button>
            </form>
          )}
        </section>
      </div>
    </PageWrapper>
  );
}
