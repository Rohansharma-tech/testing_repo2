// =============================================
// models/Appeal.js — Appeal Database Schema
// =============================================

const mongoose = require("mongoose");

const appealSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      required: true,
    },
    // Date in YYYY-MM-DD format
    date: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    adminResponse: {
      type: String,
      default: null,
      trim: true,
    },

    // ── Re-validation (when admin approves with required re-check) ────────────
    // When requiresRevalidation=true, the attendance record stays ABSENT until
    // the user successfully marks attendance within the appeal window.
    requiresRevalidation: {
      type: Boolean,
      default: false,
    },
    // YYYY-MM-DD — the date on which re-validation must be completed
    appealDate: {
      type: String,
      default: null,
    },
    // "HH:MM" — the time window for re-validation marking
    appealStartTime: {
      type: String,
      default: null,
    },
    appealEndTime: {
      type: String,
      default: null,
    },
    // Tracks completion of the re-validation flow
    revalidationStatus: {
      type: String,
      enum: [null, "pending", "completed", "missed"],
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// A user can appeal at most once per day's cutoff instance
appealSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Appeal", appealSchema);
