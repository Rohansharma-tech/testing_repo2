// =============================================
// models/Department.js — Controlled Department Registry
// =============================================

const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    // Display name — e.g. "Computer Science & Engineering"
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    // Short code used in Employee ID generation — e.g. "CSE", "ITE"
    // 2–6 uppercase letters
    code: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      uppercase: true,
      match: [/^[A-Z]{2,6}$/, "Code must be 2–6 uppercase letters."],
    },
    // HOD who created / owns this department (null for admin-seeded depts)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Department", departmentSchema);
