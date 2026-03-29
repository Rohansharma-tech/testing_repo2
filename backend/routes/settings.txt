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

// ---- GET /api/settings/geofence ----
router.get("/geofence", protect, (req, res) => {
  const geofence = getGeofenceConfig();

  res.json({
    latitude: geofence.latitude,
    longitude: geofence.longitude,
    radius: geofence.radius,
    maxAccuracyMeters: geofence.maxAccuracyMeters,
    maxLocationAgeMs: geofence.maxLocationAgeMs,
    timeZone: geofence.timeZone,
  });
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

    return res.json({
      faceDescriptor: user.faceDescriptor,
      name: user.name,
    });
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

    await User.findByIdAndUpdate(
      req.user.id,
      {
        faceDescriptor,
        hasFace: true,
      },
      { runValidators: true }
    );

    return res.json({ message: "Face registered successfully." });
  } catch (err) {
    return res.status(500).json({ message: "Failed to register face." });
  }
});

// =============================================================
// CUTOFF TIME ENDPOINTS (Admin Only)
// =============================================================

// ---- GET /api/settings/cutoff ----
// Returns current cutoff configuration
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
// Set or update the cutoff time. Reschedules the cron job immediately.
router.put("/cutoff", protect, adminOnly, async (req, res) => {
  const { cutoffTime, cutoffTimeZone, cutoffEnabled } = req.body;

  // Validate cutoffTime format
  if (!cutoffTime || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(cutoffTime)) {
    return res.status(400).json({
      message: "cutoffTime is required and must be in HH:MM 24-hour format (e.g. '09:30').",
    });
  }

  const shouldEnable = cutoffEnabled !== false; // default true when setting a time

  try {
    const settings = await OrganizationSettings.getSingleton();

    settings.cutoffTime = cutoffTime;
    if (cutoffTimeZone) settings.cutoffTimeZone = cutoffTimeZone;
    settings.cutoffEnabled = shouldEnable;
    settings.lastUpdatedBy = req.user.id;
    await settings.save();

    // Reschedule in-process job
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
// Disables the auto-absent job (keeps the stored time for reference)
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

module.exports = router;
