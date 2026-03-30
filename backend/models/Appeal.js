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
  },
  {
    timestamps: true,
  }
);

// A user can appeal at most once per day's cutoff instance
appealSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Appeal", appealSchema);
