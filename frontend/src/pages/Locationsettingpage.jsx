// src/pages/LocationSettingsPage.jsx
// Admin-only page to configure the geofence location stored in the database.
// DB values override .env at runtime; .env remains the fallback when no DB record exists.

import { useEffect, useState } from "react";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";
import { useToast } from "../components/Toast";

const EMPTY = { latitude: "", longitude: "", radius: "" };

export default function LocationSettingsPage() {
  const [form, setForm] = useState(EMPTY);
  const [current, setCurrent] = useState(null); // last saved DB values
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const { showToast, ToastContainer } = useToast();

  // ── Load current DB values ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const res = await api.get("/settings/geofence-db");
        setCurrent(res.data);
        if (res.data.latitude !== null) {
          setForm({
            latitude: String(res.data.latitude),
            longitude: String(res.data.longitude),
            radius: String(res.data.radius),
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

  // ── "Use Current Location" ──────────────────────────────────────────────────
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

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put("/settings/geofence-db", {
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        radius: Number(form.radius),
      });
      setCurrent(res.data);
      showToast("Geofence location saved successfully.", "success");
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to save location.", "error");
    } finally {
      setSaving(false);
    }
  };

  const hasDbLocation = current?.latitude !== null && current?.latitude !== undefined;

  return (
    <PageWrapper
      title="Location Settings"
      description="Set the office geofence used for attendance verification. The saved location overrides the .env values immediately."
    >
      <ToastContainer />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        {/* ── Left: status card ── */}
        <section className="space-y-6">
          <div className="card">
            <p className="section-label">Active Geofence</p>

            {loading ? (
              <div className="mt-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 w-48 animate-pulse rounded bg-slate-200" />
                ))}
              </div>
            ) : hasDbLocation ? (
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <Row label="Latitude" value={current.latitude} />
                <Row label="Longitude" value={current.longitude} />
                <Row label="Radius" value={`${current.radius} m`} />
                <Row
                  label="Source"
                  value={
                    <span className="status-chip status-chip-success">Database</span>
                  }
                />
                {current.updatedAt && (
                  <Row
                    label="Last updated"
                    value={new Date(current.updatedAt).toLocaleString()}
                  />
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                No DB location saved yet.{" "}
                <span className="font-medium text-slate-700">.env values are active as fallback.</span>
              </div>
            )}
          </div>

          {/* Info box */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
            <p className="font-semibold">How this works</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-blue-700">
              <li>Saved values take effect immediately — no restart needed.</li>
              <li>
                When no DB record exists, <code className="rounded bg-blue-100 px-1">GEOFENCE_LAT</code>,{" "}
                <code className="rounded bg-blue-100 px-1">GEOFENCE_LNG</code>, and{" "}
                <code className="rounded bg-blue-100 px-1">GEOFENCE_RADIUS</code> from{" "}
                <code className="rounded bg-blue-100 px-1">.env</code> are used.
              </li>
              <li>Radius is the maximum distance (in metres) from the centre point.</li>
            </ul>
          </div>
        </section>

        {/* ── Right: form ── */}
        <section className="card">
          <p className="section-label">Update Location</p>

          <form onSubmit={handleSave} className="mt-5 space-y-5">
            {/* Auto-detect button */}
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
                  Use Current Location
                </>
              )}
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">or enter manually</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Latitude</label>
              <input
                type="number"
                step="any"
                min="-90"
                max="90"
                className="input-field"
                placeholder="e.g. 13.0827"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Longitude</label>
              <input
                type="number"
                step="any"
                min="-180"
                max="180"
                className="input-field"
                placeholder="e.g. 80.2707"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Radius <span className="font-normal text-slate-400">(metres)</span>
              </label>
              <input
                type="number"
                step="1"
                min="10"
                className="input-field"
                placeholder="e.g. 200"
                value={form.radius}
                onChange={(e) => setForm({ ...form, radius: e.target.value })}
                required
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Employees must be within this distance of the centre point to mark attendance.
              </p>
            </div>

            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? "Saving…" : "Save location"}
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