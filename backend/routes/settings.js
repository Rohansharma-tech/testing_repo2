// =============================================
// routes/settings.js - Settings & Face Routes
// =============================================

const express = require("express");
const router = express.Router();
const User = require("../models/User");
const OrganizationSettings = require("../models/OrganizationSettings");
const { protect, adminOnly } = require("../middleware/auth");
const { getGeofenceConfig } = require("../utils/attendance");
const {
  scheduleCutoffJob,
  cancelCutoffJob,
  getScheduledCutoff,
} = require("../services/autoCutoffScheduler");

function normalizeFaceDescriptor(faceDescriptor) {
  if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
    return null;
  }
  const normalized = faceDescriptor.map((value) => Number(value));
  return normalized.every((value) => Number.isFinite(value)) ? normalized : null;
}

/**
 * Euclidean distance between two 128-dimensional face descriptors.
 * Same threshold used by face-api.js on the frontend (0.6).
 */
const FACE_MATCH_THRESHOLD = 0.6;

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < 128; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// ---- GET /api/settings/geofence ----
// Returns the *active* geofence config (DB override wins over .env)
router.get("/geofence", protect, async (req, res) => {
  try {
    const settings = await OrganizationSettings.getSingleton();
    const geofence = getGeofenceConfig(settings);

    return res.json({
      latitude: geofence.latitude,
      longitude: geofence.longitude,
      radius: geofence.radius,
      maxAccuracyMeters: geofence.maxAccuracyMeters,
      maxLocationAgeMs: geofence.maxLocationAgeMs,
      timeZone: geofence.timeZone,
      source: geofence.source,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch geofence config." });
  }
});

// ---- GET /api/settings/geofence-db ----
// Returns only the DB-stored geofence values (null fields = not set yet)
router.get("/geofence-db", protect, adminOnly, async (req, res) => {
  try {
    const settings = await OrganizationSettings.getSingleton();
    return res.json({
      latitude: settings.geofenceLatitude,
      longitude: settings.geofenceLongitude,
      radius: settings.geofenceRadius,
      updatedAt: settings.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch DB geofence." });
  }
});

// ---- PUT /api/settings/geofence-db ----
// Saves lat/lng/radius to DB; takes effect immediately for all future requests.
router.put("/geofence-db", protect, adminOnly, async (req, res) => {
  const latitude = Number(req.body.latitude);
  const longitude = Number(req.body.longitude);
  const radius = Number(req.body.radius);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return res.status(400).json({ message: "latitude must be a number between -90 and 90." });
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ message: "longitude must be a number between -180 and 180." });
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    return res.status(400).json({ message: "radius must be a positive number (metres)." });
  }

  try {
    const settings = await OrganizationSettings.getSingleton();
    settings.geofenceLatitude = latitude;
    settings.geofenceLongitude = longitude;
    settings.geofenceRadius = radius;
    settings.lastUpdatedBy = req.user.id;
    await settings.save();

    return res.json({
      message: "Geofence location saved and active.",
      latitude: settings.geofenceLatitude,
      longitude: settings.geofenceLongitude,
      radius: settings.geofenceRadius,
      updatedAt: settings.updatedAt,
    });
  } catch (err) {
    console.error("Save geofence error:", err);
    return res.status(500).json({ message: "Failed to save geofence location." });
  }
});

// ---- GET /api/settings/face-descriptor ----
router.get("/face-descriptor", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("faceDescriptor hasFace name");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (!user.hasFace || !Array.isArray(user.faceDescriptor) || user.faceDescriptor.length === 0) {
      return res.status(400).json({ message: "No face registered. Please register your face first." });
    }

    return res.json({ faceDescriptor: user.faceDescriptor, name: user.name });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch face data." });
  }
});

// ---- PUT /api/settings/register-face ----
router.put("/register-face", protect, async (req, res) => {
  const faceDescriptor = normalizeFaceDescriptor(req.body.faceDescriptor);

  if (!faceDescriptor) {
    return res.status(400).json({ message: "A valid 128-value face descriptor array is required." });
  }

  try {
    const user = await User.findById(req.user.id).select("hasFace faceDescriptor");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.hasFace || user.faceDescriptor.length > 0) {
      return res.status(409).json({ message: "Face already registered" });
    }

    // ── Global uniqueness check ────────────────────────────────────────────────
    // Scan all other registered users and reject if this face is too similar.
    const otherUsers = await User.find(
      { hasFace: true, _id: { $ne: req.user.id } },
      { faceDescriptor: 1, name: 1 }
    ).lean();

    for (const other of otherUsers) {
      if (!Array.isArray(other.faceDescriptor) || other.faceDescriptor.length !== 128) continue;
      const distance = euclideanDistance(faceDescriptor, other.faceDescriptor);
      if (distance < FACE_MATCH_THRESHOLD) {
        return res.status(409).json({
          message: "This face is already registered to another account. Each face can only be linked to one account.",
          code: "FACE_DUPLICATE",
        });
      }
    }
    // ── End uniqueness check ───────────────────────────────────────────────────

    await User.findByIdAndUpdate(
      req.user.id,
      { faceDescriptor, hasFace: true },
      { runValidators: true },
    );

    return res.json({ message: "Face registered successfully." });
  } catch (err) {
    console.error("register-face error:", err);
    return res.status(500).json({ message: "Failed to register face." });
  }
});

// =============================================================
// CUTOFF TIME ENDPOINTS (Admin Only)
// =============================================================

// ---- GET /api/settings/cutoff ----
router.get("/cutoff", protect, adminOnly, async (req, res) => {
  try {
    const settings = await OrganizationSettings.getSingleton();
    return res.json({
      cutoffTime: settings.cutoffTime,
      cutoffTimeZone: settings.cutoffTimeZone,
      cutoffEnabled: settings.cutoffEnabled,
      scheduledCutoff: getScheduledCutoff(),
      updatedAt: settings.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch cutoff settings." });
  }
});

// ---- PUT /api/settings/cutoff ----
router.put("/cutoff", protect, adminOnly, async (req, res) => {
  const { cutoffTime, cutoffTimeZone, cutoffEnabled } = req.body;

  if (!cutoffTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(cutoffTime)) {
    return res.status(400).json({
      message: "cutoffTime is required and must be in HH:MM 24-hour format (e.g. '09:30').",
    });
  }

  const shouldEnable = cutoffEnabled !== false;

  try {
    const settings = await OrganizationSettings.getSingleton();
    settings.cutoffTime = cutoffTime;
    if (cutoffTimeZone) settings.cutoffTimeZone = cutoffTimeZone;
    settings.cutoffEnabled = shouldEnable;
    settings.lastUpdatedBy = req.user.id;
    await settings.save();

    if (shouldEnable) {
      scheduleCutoffJob(settings.cutoffTime, settings.cutoffTimeZone);
    } else {
      cancelCutoffJob();
    }

    return res.json({
      message: `Cutoff time ${shouldEnable ? "set and activated" : "saved but disabled"}.`,
      cutoffTime: settings.cutoffTime,
      cutoffTimeZone: settings.cutoffTimeZone,
      cutoffEnabled: settings.cutoffEnabled,
      scheduledCutoff: getScheduledCutoff(),
    });
  } catch (err) {
    console.error("Set cutoff error:", err);
    return res.status(500).json({ message: "Failed to save cutoff settings." });
  }
});

// ---- DELETE /api/settings/cutoff ----
router.delete("/cutoff", protect, adminOnly, async (req, res) => {
  try {
    const settings = await OrganizationSettings.getSingleton();
    settings.cutoffEnabled = false;
    settings.lastUpdatedBy = req.user.id;
    await settings.save();

    cancelCutoffJob();

    return res.json({
      message: "Auto-absent cutoff has been disabled.",
      cutoffEnabled: false,
      scheduledCutoff: null,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to disable cutoff." });
  }
});

// =============================================================
// ATTENDANCE TIME WINDOW ENDPOINTS (Admin Only)
// =============================================================

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ---- GET /api/settings/attendance-window ----
// Returns the attendance start/end time window + cutoff meta.
router.get("/attendance-window", protect, adminOnly, async (req, res) => {
  try {
    const settings = await OrganizationSettings.getSingleton();
    return res.json({
      attendanceStartTime: settings.attendanceStartTime,
      attendanceEndTime: settings.attendanceEndTime,
      cutoffEnabled: settings.cutoffEnabled,
      cutoffTimeZone: settings.cutoffTimeZone,
      scheduledCutoff: getScheduledCutoff(),
      updatedAt: settings.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch attendance window settings." });
  }
});

// ---- PUT /api/settings/attendance-window ----
// Saves attendanceStartTime and/or attendanceEndTime.
// When attendanceEndTime is set it ALSO re-drives the auto-absent cron
// (takes priority over the legacy cutoffTime).
router.put("/attendance-window", protect, adminOnly, async (req, res) => {
  const { attendanceStartTime, attendanceEndTime, cutoffEnabled, cutoffTimeZone } = req.body;

  // Validate whichever fields were supplied
  if (attendanceStartTime !== undefined && attendanceStartTime !== null && attendanceStartTime !== "") {
    if (!TIME_RE.test(attendanceStartTime)) {
      return res.status(400).json({
        message: "attendanceStartTime must be in HH:MM 24-hour format (e.g. '08:00').",
      });
    }
  }
  if (attendanceEndTime !== undefined && attendanceEndTime !== null && attendanceEndTime !== "") {
    if (!TIME_RE.test(attendanceEndTime)) {
      return res.status(400).json({
        message: "attendanceEndTime must be in HH:MM 24-hour format (e.g. '10:00').",
      });
    }
  }
  if (
    attendanceStartTime && attendanceEndTime &&
    attendanceStartTime >= attendanceEndTime
  ) {
    return res.status(400).json({
      message: "attendanceStartTime must be earlier than attendanceEndTime.",
    });
  }

  try {
    const settings = await OrganizationSettings.getSingleton();

    // Null means "clear this boundary"
    if (attendanceStartTime !== undefined) {
      settings.attendanceStartTime = attendanceStartTime || null;
    }
    if (attendanceEndTime !== undefined) {
      settings.attendanceEndTime = attendanceEndTime || null;
    }
    if (cutoffTimeZone) settings.cutoffTimeZone = cutoffTimeZone;

    // cutoffEnabled controls whether the auto-absent cron fires
    const shouldEnable = cutoffEnabled !== false && cutoffEnabled !== undefined
      ? Boolean(cutoffEnabled)
      : settings.cutoffEnabled;
    settings.cutoffEnabled = shouldEnable;
    settings.lastUpdatedBy = req.user.id;
    await settings.save();

    // Re-drive the scheduler: prefer attendanceEndTime, fall back to cutoffTime
    const effectiveCutoff = settings.attendanceEndTime || settings.cutoffTime;
    if (shouldEnable && effectiveCutoff) {
      scheduleCutoffJob(effectiveCutoff, settings.cutoffTimeZone);
    } else if (!shouldEnable) {
      cancelCutoffJob();
    }

    return res.json({
      message: "Attendance window updated.",
      attendanceStartTime: settings.attendanceStartTime,
      attendanceEndTime: settings.attendanceEndTime,
      cutoffEnabled: settings.cutoffEnabled,
      cutoffTimeZone: settings.cutoffTimeZone,
      scheduledCutoff: getScheduledCutoff(),
      updatedAt: settings.updatedAt,
    });
  } catch (err) {
    console.error("Save attendance-window error:", err);
    return res.status(500).json({ message: "Failed to save attendance window settings." });
  }
});

module.exports = router;