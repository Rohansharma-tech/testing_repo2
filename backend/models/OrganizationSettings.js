// =============================================
// models/OrganizationSettings.js — Org-Level Settings Singleton
// =============================================

const mongoose = require("mongoose");

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function timeValidator(value) {
  if (value === null || value === undefined) return true;
  return TIME_RE.test(value);
}

const organizationSettingsSchema = new mongoose.Schema(
  {
    // Singleton key — only one document ever exists
    _singleton: {
      type: String,
      default: "global",
      unique: true,
      immutable: true,
    },

    // ── Cutoff / Attendance Window ─────────────────────────────────────────────
    // Legacy field — kept for backward-compat. New code uses attendanceEndTime.
    cutoffTime: {
      type: String,
      default: null,
      validate: {
        validator: timeValidator,
        message: "cutoffTime must be in HH:MM 24-hour format (e.g. '09:30').",
      },
    },
    cutoffTimeZone: {
      type: String,
      default: process.env.APP_TIMEZONE || "Asia/Kolkata",
    },
    cutoffEnabled: {
      type: Boolean,
      default: false,
    },

    // ── Morning Attendance Window ──────────────────────────────────────────────
    // Users cannot mark MORNING attendance BEFORE attendanceStartTime.
    // Users cannot mark MORNING attendance AFTER  attendanceEndTime.
    // Auto-absent cron fires at attendanceEndTime for morning session.
    attendanceStartTime: {
      type: String,
      default: null,
      validate: {
        validator: timeValidator,
        message: "attendanceStartTime must be in HH:MM 24-hour format.",
      },
    },
    attendanceEndTime: {
      type: String,
      default: null,
      validate: {
        validator: timeValidator,
        message: "attendanceEndTime must be in HH:MM 24-hour format.",
      },
    },

    // ── Evening Attendance Window ──────────────────────────────────────────────
    // Users cannot mark EVENING attendance BEFORE eveningStartTime.
    // Users cannot mark EVENING attendance AFTER  eveningEndTime.
    // Auto-absent cron fires at eveningEndTime for evening session.
    eveningStartTime: {
      type: String,
      default: null,
      validate: {
        validator: timeValidator,
        message: "eveningStartTime must be in HH:MM 24-hour format.",
      },
    },
    eveningEndTime: {
      type: String,
      default: null,
      validate: {
        validator: timeValidator,
        message: "eveningEndTime must be in HH:MM 24-hour format.",
      },
    },
    eveningCutoffEnabled: {
      type: Boolean,
      default: false,
    },

    // ── Geofence (DB-stored override) ─────────────────────────────────────────
    // When present, these values override the GEOFENCE_LAT / GEOFENCE_LNG /
    // GEOFENCE_RADIUS environment variables at runtime.
    // When null, the system falls back to .env (fully backward-compatible).
    geofenceLatitude: {
      type: Number,
      default: null,
    },
    geofenceLongitude: {
      type: Number,
      default: null,
    },
    geofenceRadius: {
      type: Number,
      default: null,
    },
    // Maximum GPS accuracy (in meters) accepted when marking attendance.
    // When null, falls back to MAX_LOCATION_ACCURACY_METERS env var, then max(radius, 120).
    maxAccuracyMeters: {
      type: Number,
      default: null,
      min: 10,
    },

    // Metadata
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Static helper: get-or-create the single settings document.
// Returns a Mongoose document so callers can mutate and call .save().
// For read-only geofence validation use findOne().lean() directly in the route.
organizationSettingsSchema.statics.getSingleton = async function () {
  let settings = await this.findOne({ _singleton: "global" });
  if (!settings) {
    settings = await this.create({ _singleton: "global" });
  }
  return settings;
};


module.exports = mongoose.model("OrganizationSettings", organizationSettingsSchema);