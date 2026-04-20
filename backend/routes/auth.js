// =============================================
// routes/auth.js — Authentication Routes (v2 — Refresh Token + Revocation)
// =============================================
// Token strategy:
//   Access Token  → 30 min, HttpOnly cookie "token"
//   Refresh Token → 7 days, HttpOnly cookie "refreshToken" + stored in MongoDB
//
// Refresh token rotation + theft detection:
//   - Every /refresh call issues a NEW refresh token (old one deleted)
//   - All tokens share a "family" string (UUID per login session)
//   - If a REUSED (already rotated) refresh token arrives → family revoked instantly
//     This signals token theft and kills all sessions from that login.
// =============================================

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const { protect } = require("../middleware/auth");
const logger = require("../utils/logger");

// ── Cookie helpers ────────────────────────────────────────────────────────────

const isProduction = process.env.NODE_ENV === "production";

function accessCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 30 * 60 * 1000,           // 30 minutes
  };
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/api/auth",                 // refresh cookie only sent to /api/auth/*
  };
}

function clearCookies(res) {
  const base = { httpOnly: true, secure: isProduction, sameSite: isProduction ? "none" : "lax" };
  res.cookie("token", "", { ...base, maxAge: 0 });
  res.cookie("refreshToken", "", { ...base, path: "/api/auth", maxAge: 0 });
}

// ── Token factories ───────────────────────────────────────────────────────────

function signAccessToken(user) {
  return jwt.sign(
    { id: user._id || user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "30m" }
  );
}

function signRefreshToken(userId) {
  return jwt.sign(
    { id: userId },
    process.env.REFRESH_SECRET,
    { expiresIn: "7d" }
  );
}

// ── Profile image URL helper ──────────────────────────────────────────────────
// Must match the same logic as users.js sanitize() so Navbar/ProfilePage
// see the correct absolute URL regardless of which endpoint returned the user.
function buildProfileImageUrl(fileId) {
  if (!fileId) return null;
  // Guard: only build a URL for valid 24-char hex GridFS ObjectIds.
  // Legacy values (old local paths, Cloudinary URLs) are treated as null.
  if (!/^[a-f\d]{24}$/i.test(fileId)) return null;
  const base = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  return `${base}/api/files/${fileId}`;
}

function serializeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    hasFace: user.hasFace,
    department: user.department,
    profileImage: user.profileImage,
    profileImageUrl: buildProfileImageUrl(user.profileImage),
  };
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";

  // Input validation
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }
  if (typeof email !== "string" || typeof password !== "string") {
    logger.security.suspiciousInput(ip, "/login", "non-string credentials");
    return res.status(400).json({ message: "Invalid input." });
  }
  if (!/\S+@\S+\.\S+/.test(email.trim())) {
    return res.status(400).json({ message: "Invalid email format." });
  }
  if (email.length > 200 || password.length > 200) {
    logger.security.suspiciousInput(ip, "/login", "input too long");
    return res.status(400).json({ message: "Input too long." });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      logger.security.loginFail(email, ip, "user_not_found");
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (user.isDeleted) {
      logger.security.loginFail(email, ip, "account_deactivated");
      return res.status(403).json({ message: "This account has been deactivated. Please contact your administrator." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.security.loginFail(email, ip, "wrong_password");
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // ── Issue tokens ──────────────────────────────────────────────────────────

    const accessToken = signAccessToken(user);
    const rawRefresh  = signRefreshToken(user._id);
    const family      = uuidv4();  // new family per login session

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({
      token: rawRefresh,
      userId: user._id,
      family,
      expiresAt,
      ip,
      userAgent: req.headers["user-agent"]?.slice(0, 200) || null,
    });

    res.cookie("token",        accessToken, accessCookieOptions());
    res.cookie("refreshToken", rawRefresh,  refreshCookieOptions());

    logger.security.loginSuccess(email, ip, user.role);

    return res.json({ user: serializeUser(user) });
  } catch (err) {
    logger.error("Login error", { err: err.message });
    return res.status(500).json({ message: "Login failed." });
  }
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
// Verifies the refresh token cookie, rotates it, and issues a new access token.
router.post("/refresh", async (req, res) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const rawRefresh = req.cookies?.refreshToken;

  if (!rawRefresh) {
    return res.status(401).json({ message: "No refresh token." });
  }

  try {
    // 1. Verify JWT signature and expiry
    let decoded;
    try {
      decoded = jwt.verify(rawRefresh, process.env.REFRESH_SECRET);
    } catch {
      clearCookies(res);
      logger.security.tokenRefreshFail(ip, "invalid_or_expired_jwt");
      return res.status(401).json({ message: "Refresh token invalid or expired." });
    }

    // 2. Look up token in DB
    const storedToken = await RefreshToken.findOne({ token: rawRefresh });

    if (!storedToken) {
      // Token not in DB but JWT is valid → REUSE DETECTED (theft signal)
      // Revoke the entire family to protect all sessions from this login
      const anyFamily = await RefreshToken.findOne({ userId: decoded.id });
      if (anyFamily) {
        const { deletedCount } = await RefreshToken.deleteMany({ family: anyFamily.family });
        logger.security.tokenTheft(decoded.id, ip, anyFamily.family);
        logger.warn("TOKEN_REUSE", { userId: decoded.id, deletedSessions: deletedCount });
      }
      clearCookies(res);
      return res.status(401).json({ message: "Session compromised. Please log in again." });
    }

    // 3. Load user (check not deleted)
    const user = await User.findById(storedToken.userId).select("-password -faceDescriptor");
    if (!user || user.isDeleted) {
      await RefreshToken.deleteMany({ userId: storedToken.userId });
      clearCookies(res);
      return res.status(401).json({ message: "Account not found or deactivated." });
    }

    // 4. Rotate: delete old token, create new one in same family
    await RefreshToken.deleteOne({ _id: storedToken._id });

    const newAccess  = signAccessToken(user);
    const newRefresh = signRefreshToken(user._id);
    const expiresAt  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
      token: newRefresh,
      userId: user._id,
      family: storedToken.family, // keep same family
      expiresAt,
      ip,
      userAgent: req.headers["user-agent"]?.slice(0, 200) || null,
    });

    res.cookie("token",        newAccess,  accessCookieOptions());
    res.cookie("refreshToken", newRefresh, refreshCookieOptions());

    logger.security.tokenRefresh(user._id, ip);

    return res.json({ user: serializeUser(user) });
  } catch (err) {
    logger.error("Token refresh error", { err: err.message });
    clearCookies(res);
    return res.status(500).json({ message: "Token refresh failed." });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post("/logout", async (req, res) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  const rawRefresh = req.cookies?.refreshToken;

  if (rawRefresh) {
    try {
      const stored = await RefreshToken.findOneAndDelete({ token: rawRefresh });
      if (stored) logger.security.logout(stored.userId, ip);
    } catch { /* ignore — still clear cookies */ }
  }

  clearCookies(res);
  return res.json({ message: "Logged out successfully." });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -faceDescriptor");
    if (!user || user.isDeleted) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.json(serializeUser(user));
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch user." });
  }
});

// ── GET /api/auth/session ─────────────────────────────────────────────────────
// Silent session restore — always 200. Returns user or null.
router.get("/session", async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (!token) return res.json({ user: null });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      // Access token expired — client should call /refresh
      return res.json({ user: null, expired: true });
    }

    if (!decoded.id || !decoded.role) return res.json({ user: null });

    const user = await User.findById(decoded.id).select("-password -faceDescriptor");
    if (!user || user.isDeleted) return res.json({ user: null });

    return res.json({ user: serializeUser(user) });
  } catch (err) {
    logger.error("[/session] Unexpected error:", { err: err.message });
    return res.json({ user: null });
  }
});

// ── POST /api/auth/logout-all ─────────────────────────────────────────────────
// Revoke ALL sessions for the current user (nuclear logout)
router.post("/logout-all", protect, async (req, res) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  try {
    const { deletedCount } = await RefreshToken.deleteMany({ userId: req.user.id });
    clearCookies(res);
    logger.info("LOGOUT_ALL", { userId: req.user.id, sessionsRevoked: deletedCount, ip });
    return res.json({ message: `Logged out from all ${deletedCount} sessions.` });
  } catch (err) {
    return res.status(500).json({ message: "Failed to revoke all sessions." });
  }
});

module.exports = router;