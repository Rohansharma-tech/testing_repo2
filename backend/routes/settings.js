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
  scheduleEveningCutoffJob,
  cancelEveningCutoffJob,
  getScheduledEveningCutoff,
} = require("../services/autoCutoffScheduler");

function normalizeFaceDescriptor(faceDescriptor) {
  if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
    return null;
  }
  const normalized = faceDescriptor.map((value) => Number(value));
  return normalized.every((value) => Number.isFinite(value)) ? normalized : null;
}

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
router.get("/geofence", protect, async (req, res) => {
  try {
    // Use lean() to always get a fresh plain object — avoids Mongoose document cache
    const settings = await OrganizationSettings.findOne({ _singleton: "global" }).lean();
    const geofence = getGeofenceConfig(settings || {});

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
router.get("/geofence-db", protect, adminOnly, async (req, res) => {
  try {
    const settings = await OrganizationSettings.getSingleton();
    return res.json({
      latitude: settings.geofenceLatitude,
      longitude: settings.geofenceLongitude,
      radius: settings.geofenceRadius,
      maxAccuracyMeters: settings.maxAccuracyMeters ?? null,
      updatedAt: settings.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch DB geofence." });
  }
});

// ---- PUT /api/settings/geofence-db ----
router.put("/geofence-db", protect, adminOnly, async (req, res) => {
  const latitude = Number(req.body.latitude);
  const longitude = Number(req.body.longitude);
  const radius = Number(req.body.radius);
  // maxAccuracyMeters is optional — if not provided, keep existing DB value
  const maxAccuracyMeters = req.body.maxAccuracyMeters !== undefined
    ? Number(req.body.maxAccuracyMeters)
    : undefined;

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return res.status(400).json({ message: "latitude must be a number between -90 and 90." });
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ message: "longitude must be a number between -180 and 180." });
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    return res.status(400).json({ message: "radius must be a positive number (metres)." });
  }
  if (maxAccuracyMeters !== undefined && (!Number.isFinite(maxAccuracyMeters) || maxAccuracyMeters < 10)) {
    return res.status(400).json({ message: "maxAccuracyMeters must be a number >= 10." });
  }

  try {
    const settings = await OrganizationSettings.getSingleton();
    settings.geofenceLatitude = latitude;
    settings.geofenceLongitude = longitude;
    settings.geofenceRadius = radius;
    if (maxAccuracyMeters !== undefined) settings.maxAccuracyMeters = maxAccuracyMeters;
    settings.lastUpdatedBy = req.user.id;
    await settings.save();

    console.log(`📍 [Geofence] Updated: lat=${latitude}, lng=${longitude}, radius=${radius}m by user ${req.user.id}`);

    return res.json({
      message: "Geofence location saved and active.",
      latitude: settings.geofenceLatitude,
      longitude: settings.geofenceLongitude,
      radius: settings.geofenceRadius,
      maxAccuracyMeters: settings.maxAccuracyMeters ?? null,
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
// CUTOFF TIME ENDPOINTS (Admin Only) — Legacy
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
router.get("/attendance-window", protect, adminOnly, async (req, res) => {
  try {
    const settings = await OrganizationSettings.getSingleton();
    return res.json({
      // Morning session
      attendanceStartTime: settings.attendanceStartTime,
      attendanceEndTime: settings.attendanceEndTime,
      cutoffEnabled: settings.cutoffEnabled,
      scheduledCutoff: getScheduledCutoff(),
      // Evening session
      eveningStartTime: settings.eveningStartTime,
      eveningEndTime: settings.eveningEndTime,
      eveningCutoffEnabled: settings.eveningCutoffEnabled,
      scheduledEveningCutoff: getScheduledEveningCutoff(),
      // Shared
      cutoffTimeZone: settings.cutoffTimeZone,
      updatedAt: settings.updatedAt,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch attendance window settings." });
  }
});

// ---- PUT /api/settings/attendance-window ----
router.put("/attendance-window", protect, adminOnly, async (req, res) => {
  const {
    attendanceStartTime,
    attendanceEndTime,
    cutoffEnabled,
    cutoffTimeZone,
    eveningStartTime,
    eveningEndTime,
    eveningCutoffEnabled,
  } = req.body;

  // Validate morning fields
  if (attendanceStartTime !== undefined && attendanceStartTime !== null && attendanceStartTime !== "") {
    if (!TIME_RE.test(attendanceStartTime)) {
      return res.status(400).json({ message: "attendanceStartTime must be in HH:MM 24-hour format (e.g. '08:00')." });
    }
  }
  if (attendanceEndTime !== undefined && attendanceEndTime !== null && attendanceEndTime !== "") {
    if (!TIME_RE.test(attendanceEndTime)) {
      return res.status(400).json({ message: "attendanceEndTime must be in HH:MM 24-hour format (e.g. '10:00')." });
    }
  }
  if (attendanceStartTime && attendanceEndTime && attendanceStartTime >= attendanceEndTime) {
    return res.status(400).json({ message: "Morning start time must be earlier than morning end time." });
  }

  // Validate evening fields
  if (eveningStartTime !== undefined && eveningStartTime !== null && eveningStartTime !== "") {
    if (!TIME_RE.test(eveningStartTime)) {
      return res.status(400).json({ message: "eveningStartTime must be in HH:MM 24-hour format (e.g. '17:00')." });
    }
  }
  if (eveningEndTime !== undefined && eveningEndTime !== null && eveningEndTime !== "") {
    if (!TIME_RE.test(eveningEndTime)) {
      return res.status(400).json({ message: "eveningEndTime must be in HH:MM 24-hour format (e.g. '19:00')." });
    }
  }
  if (eveningStartTime && eveningEndTime && eveningStartTime >= eveningEndTime) {
    return res.status(400).json({ message: "Evening start time must be earlier than evening end time." });
  }

  // Ensure morning end < evening start (if both set)
  const effectiveMorningEnd = attendanceEndTime ?? null;
  const effectiveEveningStart = eveningStartTime ?? null;
  if (effectiveMorningEnd && effectiveEveningStart && effectiveMorningEnd >= effectiveEveningStart) {
    return res.status(400).json({ message: "Morning end time must be earlier than evening start time." });
  }

  try {
    const settings = await OrganizationSettings.getSingleton();

    // Morning window
    if (attendanceStartTime !== undefined) settings.attendanceStartTime = attendanceStartTime || null;
    if (attendanceEndTime !== undefined) settings.attendanceEndTime = attendanceEndTime || null;
    if (cutoffTimeZone) settings.cutoffTimeZone = cutoffTimeZone;

    // Properly handle false: only fall back to existing value when the field was not sent at all.
    const shouldEnableMorning = cutoffEnabled !== undefined
      ? Boolean(cutoffEnabled)
      : settings.cutoffEnabled;
    settings.cutoffEnabled = shouldEnableMorning;

    // Evening window
    if (eveningStartTime !== undefined) settings.eveningStartTime = eveningStartTime || null;
    if (eveningEndTime !== undefined) settings.eveningEndTime = eveningEndTime || null;

    // Auto-enable evening cron when eveningEndTime is being set and the toggle wasn't explicitly
    // flipped off — this prevents the admin from having to enable two separate controls.
    const newEveningEndTime = eveningEndTime !== undefined ? (eveningEndTime || null) : settings.eveningEndTime;
    const shouldEnableEvening = eveningCutoffEnabled !== undefined
      ? Boolean(eveningCutoffEnabled)
      : (newEveningEndTime ? true : settings.eveningCutoffEnabled);
    settings.eveningCutoffEnabled = shouldEnableEvening;

    settings.lastUpdatedBy = req.user.id;
    await settings.save();

    // Re-drive morning scheduler
    const effectiveMorningCutoff = settings.attendanceEndTime || settings.cutoffTime;
    if (shouldEnableMorning && effectiveMorningCutoff) {
      scheduleCutoffJob(effectiveMorningCutoff, settings.cutoffTimeZone);
    } else if (!shouldEnableMorning) {
      cancelCutoffJob();
    }

    // Re-drive evening scheduler
    if (shouldEnableEvening && settings.eveningEndTime) {
      scheduleEveningCutoffJob(settings.eveningEndTime, settings.cutoffTimeZone);
    } else if (!shouldEnableEvening) {
      cancelEveningCutoffJob();
    }

    return res.json({
      message: "Attendance window updated.",
      attendanceStartTime: settings.attendanceStartTime,
      attendanceEndTime: settings.attendanceEndTime,
      cutoffEnabled: settings.cutoffEnabled,
      scheduledCutoff: getScheduledCutoff(),
      eveningStartTime: settings.eveningStartTime,
      eveningEndTime: settings.eveningEndTime,
      eveningCutoffEnabled: settings.eveningCutoffEnabled,
      scheduledEveningCutoff: getScheduledEveningCutoff(),
      cutoffTimeZone: settings.cutoffTimeZone,
      updatedAt: settings.updatedAt,
    });
  } catch (err) {
    console.error("Save attendance-window error:", err);
    return res.status(500).json({ message: "Failed to save attendance window settings." });
  }
});

module.exports = router;