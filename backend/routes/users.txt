// =============================================
// routes/users.js — User Management Routes (Admin Only)
// =============================================

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { protect, adminOnly } = require("../middleware/auth");

function normalizeFaceDescriptor(faceDescriptor) {
  if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) return null;
  const normalized = faceDescriptor.map((value) => Number(value));
  return normalized.every((value) => Number.isFinite(value)) ? normalized : null;
}

router.use(protect, adminOnly);

// ---- GET /api/users ----
router.get("/", async (req, res) => {
  try {
    const users = await User.find().select("-password -faceDescriptor").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users." });
  }
});

// ---- GET /api/users/departments ----
// ✅ FIX 3: Returns all unique department names that exist on users
router.get("/departments", async (req, res) => {
  try {
    const departments = await User.distinct("department", {
      department: { $ne: null, $exists: true },
    });
    res.json(departments.filter(Boolean).sort());
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch departments." });
  }
});

// ---- POST /api/users ----
router.post("/", async (req, res) => {
  // ✅ FIX 2: department is now read from req.body
  const { name, email, password, role, department } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Name, email, and password are required." });
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "A user with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role || "user",
      department: department || null, // ✅ FIX 2: persisted to DB
    });

    res.status(201).json({
      message: "User created successfully.",
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        department: newUser.department,
        hasFace: newUser.hasFace,
      },
    });
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ message: "Failed to create user." });
  }
});

// ---- DELETE /api/users/:id ----
router.delete("/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json({ message: "User deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete user." });
  }
});

// ---- PUT /api/users/:id/face ----
router.put("/:id/face", async (req, res) => {
  const faceDescriptor = normalizeFaceDescriptor(req.body.faceDescriptor);
  if (!faceDescriptor) {
    return res.status(400).json({ message: "A valid 128-value face descriptor array is required." });
  }
  try {
    const user = await User.findById(req.params.id).select("hasFace faceDescriptor");
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.hasFace || user.faceDescriptor.length > 0) {
      return res.status(409).json({ message: "Face already registered" });
    }
    await User.findByIdAndUpdate(req.params.id, { faceDescriptor, hasFace: true }, { runValidators: true });
    res.json({ message: "Face registered successfully." });
  } catch (err) {
    res.status(500).json({ message: "Failed to save face data." });
  }
});

module.exports = router;