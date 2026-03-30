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
