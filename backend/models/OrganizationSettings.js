// =============================================
// models/OrganizationSettings.js — Org-Level Settings Singleton
// =============================================

const mongoose = require("mongoose");

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
        validator(value) {
          if (value === null || value === undefined) return true;
          return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
        },
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

    // ── Attendance Time Window (new) ───────────────────────────────────────────
    // Users cannot mark attendance BEFORE attendanceStartTime.
    // Users cannot mark attendance AFTER  attendanceEndTime.
    // Auto-absent cron fires at attendanceEndTime (preferred over cutoffTime).
    attendanceStartTime: {
      type: String,
      default: null,
      validate: {
        validator(value) {
          if (value === null || value === undefined) return true;
          return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
        },
        message: "attendanceStartTime must be in HH:MM 24-hour format.",
      },
    },
    attendanceEndTime: {
      type: String,
      default: null,
      validate: {
        validator(value) {
          if (value === null || value === undefined) return true;
          return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
        },
        message: "attendanceEndTime must be in HH:MM 24-hour format.",
      },
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

    // Metadata
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Static helper: get-or-create the single settings document
organizationSettingsSchema.statics.getSingleton = async function () {
  let settings = await this.findOne({ _singleton: "global" });
  if (!settings) {
    settings = await this.create({ _singleton: "global" });
  }
  return settings;
};

module.exports = mongoose.model("OrganizationSettings", organizationSettingsSchema);