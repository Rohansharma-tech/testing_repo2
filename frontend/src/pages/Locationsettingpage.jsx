// src/pages/LocationSettingsPage.jsx
// Admin-only page to configure the geofence location stored in the database.
// DB values override .env at runtime; .env remains the fallback when no DB record exists.

import { useEffect, useState } from "react";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";
import { useToast } from "../components/Toast";

const EMPTY = { latitude: "", longitude: "", radius: "", maxAccuracyMeters: "" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LocationSettingsPage() {
  const [form, setForm] = useState(EMPTY);
  const [current, setCurrent] = useState(null);
  const [activeGeofence, setActiveGeofence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const { showToast, ToastContainer } = useToast();

  useEffect(() => {
    async function load() {
      try {
        const [dbRes, activeRes] = await Promise.all([
          api.get("/settings/geofence-db"),
          api.get("/settings/geofence"),
        ]);
        setCurrent(dbRes.data);
        setActiveGeofence(activeRes.data);
        if (dbRes.data.latitude !== null && dbRes.data.latitude !== undefined) {
          setForm({
            latitude: String(dbRes.data.latitude),
            longitude: String(dbRes.data.longitude),
            radius: String(dbRes.data.radius),
            maxAccuracyMeters: dbRes.data.maxAccuracyMeters != null ? String(dbRes.data.maxAccuracyMeters) : "",
          });
        }
      } catch {
        showToast("Failed to load saved location.", "error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast("Geolocation is not supported by this browser.", "error");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(7),
          longitude: pos.coords.longitude.toFixed(7),
        }));
        setLocating(false);
        showToast("Location detected. Set a radius and save.", "success");
      },
      (err) => {
        setLocating(false);
        showToast(
          err.code === 1
            ? "Location permission denied. Please allow access and try again."
            : "Could not determine location. Try again.",
          "error",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        radius: Number(form.radius),
      };
      if (form.maxAccuracyMeters !== "") payload.maxAccuracyMeters = Number(form.maxAccuracyMeters);
      const res = await api.put("/settings/geofence-db", payload);
      setCurrent(res.data);
      const activeRes = await api.get("/settings/geofence");
      setActiveGeofence(activeRes.data);
      showToast("Geofence location saved and active immediately.", "success");
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to save location.", "error");
    } finally {
      setSaving(false);
    }
  };

  const hasDbLocation = current?.latitude !== null && current?.latitude !== undefined;

  const PinIcon = (
    <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
  const RadiusIcon = (
    <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12l3-3" />
    </svg>
  );
  const CameraIcon = (
    <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
  const ClockIcon = (
    <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );

  return (
    <PageWrapper
      title="Location Settings"
      description="Set the office geofence used for attendance verification. Saved values override .env immediately."
    >
      <ToastContainer />

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">

        {/* ── Left: current state ── */}
        <div className="space-y-5">

          {/* Status header card */}
          <section className="card p-0 overflow-hidden">
            <div className="border-b border-slate-100 px-6 py-4">
              <p className="section-label">Active Geofence</p>
              <h2 className="mt-1 text-base font-semibold text-slate-900">Office Location</h2>
            </div>

            {loading ? (
              <div className="space-y-3 p-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 w-full animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : hasDbLocation ? (
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                <StatCard
                  label="Latitude"
                  value={current.latitude}
                  sub="degrees N/S"
                  icon={PinIcon}
                />
                <StatCard
                  label="Longitude"
                  value={current.longitude}
                  sub="degrees E/W"
                  icon={PinIcon}
                />
                <StatCard
                  label="Geofence Radius"
                  value={`${current.radius} m`}
                  sub="attendance boundary"
                  icon={RadiusIcon}
                />
                {current.maxAccuracyMeters != null && (
                  <StatCard
                    label="Max GPS Accuracy"
                    value={`${current.maxAccuracyMeters} m`}
                    sub="GPS fix threshold"
                    icon={CameraIcon}
                  />
                )}
                {current.updatedAt && (
                  <div className="sm:col-span-2">
                    <StatCard
                      label="Last Updated"
                      value={new Date(current.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      sub="DB overrides .env immediately"
                      icon={ClockIcon}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6">
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                    {PinIcon}
                  </div>
                  <p className="text-sm font-medium text-slate-700">No location saved yet</p>
                  <p className="mt-1 text-xs text-slate-400">.env values are active as fallback</p>
                </div>
              </div>
            )}
          </section>

          {/* Info note */}
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">How it works</p>
            <ul className="space-y-1.5 text-xs text-slate-500">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                Employees must be within the radius of the saved coordinates to mark attendance.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                Saved DB values override <code className="rounded bg-slate-100 px-1">.env</code> settings immediately with no restart required.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                Lower Max GPS Accuracy = stricter location check. Leave blank to use the <code className="rounded bg-slate-100 px-1">.env</code> default.
              </li>
            </ul>
          </div>
        </div>

        {/* ── Right: form ── */}
        <section className="card">
          <div className="-mx-6 -mt-6 mb-6 flex items-center gap-3 rounded-t-3xl border-b border-slate-100 bg-slate-50/60 px-6 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white shadow-sm">
              {PinIcon}
            </div>
            <div>
              <p className="section-label">Configuration</p>
              <h2 className="text-sm font-semibold text-slate-800">Update Geofence</h2>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            {/* Auto-detect */}
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={locating}
              className="btn-secondary flex w-full items-center justify-center gap-2"
            >
              {locating ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  Detecting location…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0-6C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                  </svg>
                  Use My Current Location
                </>
              )}
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-xs text-slate-400">or enter manually</span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FieldRow label="Latitude">
                <input
                  type="number" step="any" min="-90" max="90"
                  className="input-field"
                  placeholder="e.g. 13.0827"
                  value={form.latitude}
                  onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                  required
                />
              </FieldRow>
              <FieldRow label="Longitude">
                <input
                  type="number" step="any" min="-180" max="180"
                  className="input-field"
                  placeholder="e.g. 80.2707"
                  value={form.longitude}
                  onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                  required
                />
              </FieldRow>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FieldRow label="Radius (metres)">
                <input
                  type="number" step="1" min="10"
                  className="input-field"
                  placeholder="e.g. 200"
                  value={form.radius}
                  onChange={(e) => setForm({ ...form, radius: e.target.value })}
                  required
                />
              </FieldRow>
              <FieldRow label={<>Max GPS Accuracy <span className="font-normal text-slate-400 text-xs">(metres, optional)</span></>}>
                <input
                  type="number" step="1" min="10"
                  className="input-field"
                  placeholder="e.g. 200"
                  value={form.maxAccuracyMeters}
                  onChange={(e) => setForm({ ...form, maxAccuracyMeters: e.target.value })}
                />
              </FieldRow>
            </div>

            <button type="submit" disabled={saving} className="btn-primary w-full disabled:opacity-50">
              {saving ? "Saving…" : "Save Geofence Location"}
            </button>
          </form>
        </section>
      </div>
    </PageWrapper>
  );
}

// Small helper for the status card rows
function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}