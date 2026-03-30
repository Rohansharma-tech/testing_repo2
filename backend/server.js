// =============================================
// server.js — Main Entry Point for Backend
// =============================================

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const app = express();

// ---- Middleware ----
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

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