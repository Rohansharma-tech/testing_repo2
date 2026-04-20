// =============================================
// models/EmployeeCounter.js — Atomic Employee ID Counter
// =============================================
//
// Each document tracks a running sequence for one dept+year key,
// e.g.  { key: "CSE-26", seq: 3 }  → next ID will be CSE26004.
//
// NEVER increment seq manually — always use findOneAndUpdate + $inc
// so MongoDB's atomic write prevents duplicate IDs under concurrent load.

const mongoose = require("mongoose");

const employeeCounterSchema = new mongoose.Schema({
  // Composite key: "<DEPT_CODE>-<YY>", e.g. "CSE-26", "MKT-26"
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  // Current highest sequence issued for this key (starts at 0, first ID → 1)
  seq: {
    type: Number,
    default: 0,
    min: 0,
  },
});

module.exports = mongoose.model("EmployeeCounter", employeeCounterSchema);
