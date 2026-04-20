// =============================================
// routes/departments.js — Department Registry API
// =============================================

const express = require("express");
const router = express.Router();
const Department = require("../models/Department");
const { protect, adminOnly } = require("../middleware/auth");

router.use(protect);

// ── GET /api/departments — All logged-in users can fetch the list ──────────────
router.get("/", async (req, res) => {
  try {
    const departments = await Department.find().sort({ name: 1 }).select("name code createdAt");
    return res.json(departments);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch departments." });
  }
});

// ── POST /api/departments — Admin-only direct creation (seed / setup) ─────────
// Note: Inline HOD creation is handled inside POST /api/users, not here.
router.post("/", adminOnly, async (req, res) => {
  const { name, code } = req.body;
  if (!name || !code) {
    return res.status(400).json({ message: "Department name and code are required." });
  }
  const cleanCode = code.trim().toUpperCase();
  if (!/^[A-Z]{2,6}$/.test(cleanCode)) {
    return res.status(400).json({ message: "Code must be 2–6 uppercase letters (A-Z only)." });
  }
  try {
    const dept = await Department.create({
      name: name.trim(),
      code: cleanCode,
      createdBy: req.user.id,
    });
    return res.status(201).json(dept);
  } catch (err) {
    if (err.code === 11000) {
      const field = err.message.includes("code") ? "code" : "name";
      return res.status(409).json({ message: `A department with that ${field} already exists.` });
    }
    return res.status(500).json({ message: "Failed to create department." });
  }
});

module.exports = router;
