// =============================================
// models/User.js — User Database Schema
// =============================================

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    department: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Profile photo ──────────────────────────────────────────────────────────
    // Relative path under uploads/profiles/ — e.g. "uploads/profiles/abc123.jpg"
    // null means no photo uploaded yet; has zero effect on face recognition.
    profileImage: {
      type: String,
      default: null,
    },

    faceDescriptor: {
      type: [Number],
      default: [],
      validate: {
        validator(value) {
          if (!Array.isArray(value) || value.length === 0) return true;
          return value.length === 128 && value.every((entry) => Number.isFinite(entry));
        },
        message: "Face descriptor must contain exactly 128 numeric values.",
      },
    },
    hasFace: {
      type: Boolean,
      default: false,
    },
    // ── Soft-delete ────────────────────────────────────────────────────────────
    // When true the user account is deactivated (not physically removed).
    // All queries should filter { isDeleted: { $ne: true } } for "active" users.
    // Historical attendance records are preserved and remain queryable by admin.
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.pre("validate", function syncFaceFlag(next) {
  this.hasFace = Array.isArray(this.faceDescriptor) && this.faceDescriptor.length > 0;
  next();
});

module.exports = mongoose.model("User", userSchema);