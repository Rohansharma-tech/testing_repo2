// =============================================
// server.js — Main Entry Point for Backend
// =============================================

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const logger = require("./utils/logger");
const { csrfProtect } = require("./middleware/csrf");

dotenv.config();

// ⚠️  Fail fast if critical secrets are missing
if (!process.env.JWT_SECRET) {
  logger.error("FATAL: JWT_SECRET environment variable is not set.");
  process.exit(1);
}
if (!process.env.REFRESH_SECRET) {
  logger.error("FATAL: REFRESH_SECRET environment variable is not set.");
  process.exit(1);
}

const app = express();

// ---- Middleware ----
// CORS: Allow requests only from known frontend origins.
// FRONTEND_URL is set in production to the Netlify URL (no trailing slash).
// Multiple origins are supported by splitting on comma, e.g.:
//   FRONTEND_URL=https://your-site.netlify.app,http://localhost:5173
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

// ── Security Headers (Helmet) ─────────────────────────────────────────────────
// Sets X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, etc.
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// ── Request Logging (Winston) ───────────────────────────────────────────────
app.use((req, _res, next) => {
  // Skip noisy health-check and session polling
  if (req.path === "/" || req.path === "/api/auth/session") return next();
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    ua: req.headers["user-agent"]?.slice(0, 80),
  });
  next();
});

// ── CORS — must run BEFORE rate limiters ─────────────────────────────────────
// If a rate-limited 429 or OPTIONS preflight is returned before cors() runs,
// it won't have Access-Control-Allow-Origin set and the browser shows a CORS
// error even though the real problem is a rate limit. cors() must always be first.
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin '${origin}' is not allowed`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
}));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
// Brute-force / DDoS protection — placed AFTER cors() so 429 responses still
// include the correct CORS headers and aren't mis-diagnosed as CORS failures.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,                    // max 20 login attempts per window per IP
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,   // 1 minute
  max: 200,                   // 200 requests/min per IP (generous for SPA)
  message: { message: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth/login", authLimiter);
app.use("/api", apiLimiter);

app.use(express.json({ limit: "2mb" }));   // reduced from 10 MB — prevents large payload attacks
app.use(cookieParser());

// ── CSRF Protection ───────────────────────────────────────────────────────────
// Rejects any state-changing request (POST/PUT/PATCH/DELETE) that originates
// from a browser but is missing the "X-Requested-With: XMLHttpRequest" header.
// This header cannot be forged by cross-origin HTML forms or malicious fetch()
// calls that fail the CORS preflight — effectively blocking CSRF attacks.
app.use(csrfProtect);

// ── Static file serving for uploaded profile images ───────────────────────────
// Files stored in  backend/uploads/  are reachable at  GET /uploads/<filename>
// e.g.  GET /uploads/profiles/64abc123_1710000000000.jpg
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Leave supporting documents are served at  GET /uploads/leaves/<filename>
// (covered by the wildcard above — kept as a comment for documentation clarity)


// ---- Routes ----
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const attendanceRoutes = require("./routes/attendance");
const settingsRoutes = require("./routes/settings");
const leavesRoutes = require("./routes/leaves");
const appealsRoutes = require("./routes/appeals");
const departmentsRoutes = require("./routes/departments");
const filesRoutes = require("./routes/files");  // GridFS file serving
const { initCutoffScheduler } = require("./services/autoCutoffScheduler");

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/leaves", leavesRoutes);
app.use("/api/appeals", appealsRoutes);
app.use("/api/departments", departmentsRoutes);
// NOTE: /api/files/leave/:leaveId must be registered BEFORE /api/files/:fileId
// Both are handled inside routes/files.js with the correct ordering.
app.use("/api/files", filesRoutes);

// ---- Health Check ----
// Minimal response — do not expose internal versions or DB info
app.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Global Error Handler ─────────────────────────────────────────────────────
// Catches any unhandled errors thrown inside route handlers.
// Logs the full stack internally but NEVER sends it to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  logger.error("Unhandled error", { path: req.path, method: req.method, err: err.message, stack: err.stack });
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ message: process.env.NODE_ENV === "production" ? "Internal server error." : err.message });
});

// ---- Connect to MongoDB and Start Server ----
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/attendance_db";

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log("✅ Connected to MongoDB");
    await createDefaultAdmin();
    await initCutoffScheduler();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`🗄️  File storage: MongoDB GridFS (Atlas-persisted, cross-device accessible)`);
      console.log(`📍 Geofence: ${process.env.GEOFENCE_LAT}, ${process.env.GEOFENCE_LNG} (${process.env.GEOFENCE_RADIUS}m)`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// ---- Default Admin Creator ----
async function createDefaultAdmin() {
  const User = require("./models/User");
  const bcrypt = require("bcryptjs");

  const existing = await User.findOne({ role: "admin" });
  if (!existing) {
    // Generate a strong random password in production if ADMIN_DEFAULT_PASSWORD is not set
    const defaultPw = process.env.ADMIN_DEFAULT_PASSWORD || "admin123";
    const hashedPassword = await bcrypt.hash(defaultPw, 12); // increased from 10 to 12 rounds
    await User.create({
      firstName: "System",
      lastName: "Admin",
      name: "System Admin",
      email: process.env.ADMIN_DEFAULT_EMAIL || "admin@attendance.com",
      password: hashedPassword,
      role: "admin",
      department: null,
    });
    console.log(`👤 Default admin created → Email: ${process.env.ADMIN_DEFAULT_EMAIL || "admin@attendance.com"}`);
    if (!process.env.ADMIN_DEFAULT_PASSWORD) {
      console.warn("⚠️  ADMIN_DEFAULT_PASSWORD not set — using insecure default. Change immediately!");
    }
  }
}