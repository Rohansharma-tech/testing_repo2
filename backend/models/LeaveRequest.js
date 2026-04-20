// =============================================
// models/LeaveRequest.js — Leave Request Database Schema (v2 - Multi-level Approval)
// =============================================

const mongoose = require("mongoose");

// Sub-schema for a single approval stage (HOD or Principal)
const approvalSchema = new mongoose.Schema(
  {
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, enum: ["approved", "rejected", null], default: null },
    remarks: { type: String, trim: true, default: "" },
    at: { type: Date, default: null },
  },
  { _id: false }
);

const leaveRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Snapshot of employee's department at time of submission.
    // Used for HOD department-match authorization — never trust client-sent value.
    department: {
      type: String,
      trim: true,
      default: null,
    },
    date: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["full_day", "half_day"],
      default: "full_day",
    },
    halfDaySession: {
      type: String,
      enum: ["morning", "evening", null],
      default: null,
    },
    // ── Multi-level status ──────────────────────────────────────────────────────
    // Employee flow:  pending_hod → approved_hod → approved (final, Principal approves)
    //                             → rejected_hod            (final, HOD rejects)
    //                                           → rejected   (final, Principal rejects)
    // HOD flow:       pending_principal → approved (final, Principal approves)
    //                                  → rejected  (final, Principal rejects)
    status: {
      type: String,
      enum: ["pending_hod", "pending_principal", "approved_hod", "rejected_hod", "approved", "rejected"],
      default: "pending_hod",
    },

    // ── Stage-specific approval records ────────────────────────────────────────
    hodApproval: { type: approvalSchema, default: () => ({}) },
    principalApproval: { type: approvalSchema, default: () => ({}) },

    // Kept for backward compat (admin notes / old single-level flow)
    adminResponse: { type: String, default: null, trim: true },

    // ── Optional supporting document ────────────────────────────────────────────
    // Stored in MongoDB GridFS — never on the local filesystem.
    // Accessed via GET /api/files/leave/:leaveId (requires auth + role check).
    supportingDocument: {
      originalName: { type: String, default: null },
      fileId:       { type: String, default: null }, // GridFS ObjectId as hex string
      mimeType:     { type: String, default: null },
      size:         { type: Number, default: null },  // bytes
    },
  },
  { timestamps: true }
);

// Prevent duplicate leave requests for the same user + date
leaveRequestSchema.index({ userId: 1, date: 1 }, { unique: true });
// Speed up HOD dept-filtered queries
leaveRequestSchema.index({ department: 1, status: 1 });

module.exports = mongoose.model("LeaveRequest", leaveRequestSchema);
