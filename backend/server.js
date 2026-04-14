// =============================================
// server.js — Main Entry Point for Backend
// =============================================

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const path = require("path");
const { csrfProtect } = require("./middleware/csrf");

dotenv.config();

const app = express();

// ---- Middleware ----
// CORS: Allow requests only from known frontend origins.
// FRONTEND_URL is set in production to the Netlify URL (no trailing slash).
// Multiple origins are supported by splitting on comma, e.g.:
//   FRONTEND_URL=https://your-site.netlify.app,http://localhost:5173
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server calls (no origin) and whitelisted origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin '${origin}' is not allowed`));
    }
  },
  credentials: true,          // Required for HttpOnly cookies
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
}));
app.use(express.json({ limit: "10mb" }));
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

// ---- Routes ----
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const attendanceRoutes = require("./routes/attendance");
const settingsRoutes = require("./routes/settings");
const leavesRoutes = require("./routes/leaves");
const appealsRoutes = require("./routes/appeals");
const { initCutoffScheduler } = require("./services/autoCutoffScheduler");

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/leaves", leavesRoutes);
app.use("/api/appeals", appealsRoutes);

// ---- Health Check ----
app.get("/", (_req, res) => {
  res.json({ message: "Attendance System API is running ✅" });
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
      console.log(`📁 Profile uploads served at http://localhost:${PORT}/uploads/profiles/`);
      console.log(`📍 Geofence (.env): ${process.env.GEOFENCE_LAT}, ${process.env.GEOFENCE_LNG} (${process.env.GEOFENCE_RADIUS}m radius)`);
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
    const hashedPassword = await bcrypt.hash("admin123", 10);
    await User.create({
      name: "Admin",
      email: "admin@attendance.com",
      password: hashedPassword,
      role: "admin",
    });
    console.log("👤 Default admin created → Email: admin@attendance.com | Password: admin123");
  }
}