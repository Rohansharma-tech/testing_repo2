// =============================================
// middleware/auth.js — JWT Authentication + Role Guards
// =============================================

const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logger = require("../utils/logger");

// ── protect ───────────────────────────────────────────────────────────────────
// Validates the JWT from HttpOnly cookie (or Authorization header fallback).
// Attaches { id, role } to req.user.
const protect = (req, res, next) => {
  let token = req.cookies?.token;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }
  if (!token) {
    return res.status(401).json({ message: "Not authorized. No token provided." });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Guard: token must carry id and role (prevent tampered/minimal tokens)
    if (!decoded.id || !decoded.role) {
      return res.status(401).json({ message: "Invalid token structure." });
    }
    req.user = { id: decoded.id, role: decoded.role }; // only trust what we signed
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token is invalid or expired." });
  }
};

// ── adminOnly ─────────────────────────────────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    logger.security.roleViolation(req.user.id, req.user.role, "admin", req.path);
    return res.status(403).json({ message: "Access denied. Admins only." });
  }
  next();
};

// ── hodOnly ───────────────────────────────────────────────────────────────────
const hodOnly = (req, res, next) => {
  if (req.user.role !== "hod") {
    logger.security.roleViolation(req.user.id, req.user.role, "hod", req.path);
    return res.status(403).json({ message: "Access denied. HODs only." });
  }
  next();
};

// ── principalOnly ─────────────────────────────────────────────────────────────
const principalOnly = (req, res, next) => {
  if (req.user.role !== "principal") {
    logger.security.roleViolation(req.user.id, req.user.role, "principal", req.path);
    return res.status(403).json({ message: "Access denied. Principal only." });
  }
  next();
};

// ── approverOrAdmin ───────────────────────────────────────────────────────────
// Allows hod, principal, or admin through (for shared read endpoints).
const approverOrAdmin = (req, res, next) => {
  if (!["hod", "principal", "admin"].includes(req.user.role)) {
    return res.status(403).json({ message: "Access denied." });
  }
  next();
};

// ── loadFullUser ──────────────────────────────────────────────────────────────
// Fetches the full User document from DB and attaches as req.fullUser.
// Required when downstream logic needs the user's department (e.g., HOD dept check).
// Use AFTER protect.
const loadFullUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("role department email name");
    if (!user || user.isDeleted) {
      return res.status(401).json({ message: "User account not found or deactivated." });
    }
    req.fullUser = user;
    next();
  } catch (err) {
    return res.status(500).json({ message: "Failed to load user session." });
  }
};

module.exports = { protect, adminOnly, hodOnly, principalOnly, approverOrAdmin, loadFullUser };
