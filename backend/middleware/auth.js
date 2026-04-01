// =============================================
// middleware/auth.js — JWT Authentication Middleware
// =============================================

const jwt = require("jsonwebtoken");

// ---- Protect Route (any logged-in user) ----
// Reads the JWT from the HttpOnly cookie (set at login).
// Falls back to the Authorization header for backward compatibility.
const protect = (req, res, next) => {
  // Primary: read from HttpOnly cookie (secure path)
  let token = req.cookies?.token;

  // Fallback: Authorization header (e.g. curl / Postman during dev)
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
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_secret"
    );
    req.user = decoded; // { id, role }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token is invalid or expired." });
  }
};

// ---- Admin Only Route ----
// Use AFTER protect — only allows admins through
const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }
  next();
};

module.exports = { protect, adminOnly };
