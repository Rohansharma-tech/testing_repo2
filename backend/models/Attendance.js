// =============================================
// models/Attendance.js — Attendance Database Schema
// =============================================

const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    // Reference to the User who marked attendance
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Date in YYYY-MM-DD format (used to enforce one-per-day rule)
    date: {
      type: String,
      required: true,
    },

    // Time in HH:MM format (12-hour or 24-hour)
    time: {
      type: String,
      required: true,
    },

    // GPS coordinates where attendance was marked
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },

    distanceFromGeofence: {
      type: Number,
      default: null,
    },

    locationAccuracy: {
      type: Number,
      default: null,
    },

    locationTimestamp: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["present", "absent", "leave"],
      default: "present",
    },

    penalty: {
      type: Boolean,
      default: false,
    },

    source: {
      type: String,
      enum: ["normal", "leave", "appeal", "cutoff", "auto_cutoff", "appeal_approval"],
      default: "normal",
    },

    reason: {
      type: String,
      enum: [
        null,
        "outside_location",
        "location_unreliable",
        "location_stale",
        "location_tampering",
        "auto_absent",
        "window_not_open",   // blocked because attendanceStartTime not reached yet
        "window_closed",     // blocked because attendanceEndTime already passed
      ],
      default: null,
    },

    // True when this record was created by the auto-absent cron job
    autoMarked: {
      type: Boolean,
      default: false,
    },

    // True when an admin has manually approved/overridden this record.
    // Auto-absent NEVER overwrites a record where this is true.
    adminApproved: {
      type: Boolean,
      default: false,
    },

    markedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: ensures one attendance record per user per day
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
