// =============================================
// models/LeaveRequest.js — Leave Request Database Schema
// =============================================

const mongoose = require("mongoose");

const leaveRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
    // "full_day" = no attendance required for the day.
    // "half_day" = one session is waived; user must still attend the other.
    type: {
      type: String,
      enum: ["full_day", "half_day"],
      default: "full_day",
    },
    // Which session is covered by the half-day leave.
    // "morning" = Work Start is leave; user must mark Work End.
    // "evening" = Work End is leave; user must mark Work Start.
    // null for full_day leaves.
    halfDaySession: {
      type: String,
      enum: ["morning", "evening", null],
      default: null,
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

// Prevent user from creating duplicate leave requests for the same date
leaveRequestSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("LeaveRequest", leaveRequestSchema);
