// =============================================
// routes/auth.js — Authentication Routes
// =============================================

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/auth");

// ── Shared helper ─────────────────────────────────────────────────────────────
function profileImageUrl(profileImage) {
  if (!profileImage) return null;
  return `/${profileImage}`;
}

// Cookie options — shared between login and logout
const COOKIE_OPTIONS = {
  httpOnly: true,          // ← JS cannot read this cookie (blocks XSS theft)
  secure: process.env.NODE_ENV === "production",  // HTTPS-only in prod
  sameSite: "strict",      // ← blocks CSRF
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (user.isDeleted) {
      return res.status(403).json({ message: "This account has been deactivated. Please contact your administrator." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" },
    );

    // Set token in HttpOnly cookie — never exposed to JS
    res.cookie("token", token, COOKIE_OPTIONS);

    // Return the user profile (no token in body)
    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasFace: user.hasFace,
        department: user.department,
        profileImage: user.profileImage,
        profileImageUrl: profileImageUrl(user.profileImage),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: "Login failed." });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post("/logout", (_req, res) => {
  // Clear the cookie by setting maxAge to 0
  res.cookie("token", "", { ...COOKIE_OPTIONS, maxAge: 0 });
  return res.json({ message: "Logged out successfully." });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Called on every page load to restore session. Must include profileImage.
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "-password -faceDescriptor",
    );

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.isDeleted) {
      return res.status(403).json({ message: "This account has been deactivated." });
    }

    return res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      hasFace: user.hasFace,
      department: user.department,
      profileImage: user.profileImage,
      profileImageUrl: profileImageUrl(user.profileImage),
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch user." });
  }
});

module.exports = router;