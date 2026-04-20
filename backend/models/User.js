// =============================================
// models/User.js — User Database Schema
// =============================================

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // ── Core login credentials (unchanged) ────────────────────────────────────
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
      enum: ["admin", "user", "hod", "principal"],
      default: "user",
    },

    // ── Auto-generated Employee ID ─────────────────────────────────────────────
    // Format: <DEPT_CODE><YY><SEQ>  e.g. CSE26001
    // Generated atomically by the backend on document creation.
    // NEVER accepted from the client — stripped from all incoming payloads.
    employeeId: {
      type: String,
      unique: true,
      sparse: true, // allows null for admin accounts / legacy records without an ID
      trim: true,
    },

    // ── Personal Information ───────────────────────────────────────────────────
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
      default: "",
    },
    // Computed display name — kept for backward compatibility with attendance records
    name: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    nationality: {
      type: String,
      trim: true,
      default: "",
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", ""],
      default: "",
    },

    // ── Contact Details ────────────────────────────────────────────────────────
    personalEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
    },
    mobileNo: {
      type: String,
      trim: true,
      default: "",
      validate: {
        validator(v) {
          // Allow empty string or a 10-digit number
          return v === "" || /^\d{10}$/.test(v);
        },
        message: "Mobile number must be exactly 10 digits.",
      },
    },

    // ── Employment Details ─────────────────────────────────────────────────────
    department: {
      type: String,
      trim: true,
      default: null,
    },
    designation: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    dateOfJoin: {
      type: Date,
      default: null,
    },
    employeeType: {
      type: String,
      enum: ["Full-Time", "Part-Time", "Contract", "Intern", ""],
      default: "",
    },

    // ── Profile photo ──────────────────────────────────────────────────────────
    // Stores the GridFS file _id as a string (24-char hex ObjectId).
    // Access via GET /api/files/:profileImage
    profileImage: {
      type: String,
      default: null,
    },

    // ── Face recognition ──────────────────────────────────────────────────────
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

// ── Indexes ────────────────────────────────────────────────────────────────────
// Compound index to speed up ID-generation queries (dept + join year)
userSchema.index({ department: 1, dateOfJoin: 1 });

// ── Pre-validate hook ──────────────────────────────────────────────────────────
// 1. Sync hasFace flag from faceDescriptor length
// 2. Auto-compute `name` from firstName + lastName (backward compat)
userSchema.pre("validate", function syncFields(next) {
  // Face flag
  this.hasFace = Array.isArray(this.faceDescriptor) && this.faceDescriptor.length > 0;

  // Compute display name
  const full = [this.firstName, this.lastName].filter(Boolean).join(" ").trim();
  if (full) this.name = full;

  next();
});

module.exports = mongoose.model("User", userSchema);