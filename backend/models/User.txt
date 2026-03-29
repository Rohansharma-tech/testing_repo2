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

    // ✅ FIX 1: Added department field
    department: {
      type: String,
      trim: true,
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
  },
  { timestamps: true }
);

userSchema.pre("validate", function syncFaceFlag(next) {
  this.hasFace = Array.isArray(this.faceDescriptor) && this.faceDescriptor.length > 0;
  next();
});

module.exports = mongoose.model("User", userSchema);