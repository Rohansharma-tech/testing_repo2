// =============================================
// routes/users.js — User Management (Admin)
// =============================================

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const User = require("../models/User");
const { protect, adminOnly } = require("../middleware/auth");

// ── Multer setup ──────────────────────────────────────────────────────────────
// Profile images land in  backend/uploads/profiles/
// Files are renamed to  <userId>_<timestamp>.<ext>  after the user is created.
// During creation we don't have the userId yet, so we use a temp name and
// rename it afterwards.

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "profiles");

// Create the directory on first use (safe to call repeatedly)
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    // Temp name — will be renamed once we have the new user's _id
    cb(null, `tmp_${Date.now()}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, WEBP, and GIF images are accepted."), false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return the public URL path for a profileImage DB value, or null. */
function avatarUrl(profileImage) {
  if (!profileImage) return null;
  // profileImage is stored as "uploads/profiles/<filename>"
  return `/${profileImage}`;
}

/** Strip sensitive fields before sending a user object to the client. */
function sanitize(user) {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  delete obj.faceDescriptor;
  obj.profileImageUrl = avatarUrl(obj.profileImage);
  return obj;
}

// ── GET /api/users ────────────────────────────────────────────────────────────
router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select("-password -faceDescriptor").sort({ createdAt: -1 });
    const result = users.map((u) => {
      const obj = u.toObject();
      obj.profileImageUrl = avatarUrl(obj.profileImage);
      return obj;
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch users." });
  }
});

// ── GET /api/users/departments ────────────────────────────────────────────────
router.get("/departments", protect, adminOnly, async (req, res) => {
  try {
    const departments = await User.distinct("department", { department: { $ne: null } });
    return res.json(departments.sort());
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch departments." });
  }
});

// ── GET /api/users/:id/avatar ─────────────────────────────────────────────────
// Redirects to the static file URL; useful if callers only have the user id.
router.get("/:id/avatar", protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("profileImage");
    if (!user) return res.status(404).json({ message: "User not found." });
    if (!user.profileImage) return res.status(404).json({ message: "No avatar set." });
    return res.redirect(`/${user.profileImage}`);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch avatar." });
  }
});

// ── POST /api/users ───────────────────────────────────────────────────────────
// Accepts multipart/form-data (for optional photo) OR JSON (no photo).
// multer's .single() is added as optional middleware; if Content-Type is JSON
// multer is skipped via the conditional wrapper below.
router.post(
  "/",
  protect,
  adminOnly,
  // Accept an optional file field named "profileImage"
  upload.single("profileImage"),
  async (req, res) => {
    const { name, email, password, role, department } = req.body;

    if (!name || !email || !password) {
      // Clean up any uploaded temp file
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: "Name, email, and password are required." });
    }

    if (password.length < 6) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    try {
      const existing = await User.findOne({ email: email.toLowerCase().trim() });
      if (existing) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(409).json({ message: "A user with that email already exists." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await User.create({
        name,
        email,
        password: hashedPassword,
        role: role || "user",
        department: department || null,
        profileImage: null, // set after rename below
      });

      // If a photo was uploaded, rename from tmp_ to <userId>_<timestamp>.<ext>
      if (req.file) {
        const ext = path.extname(req.file.filename);
        const finalName = `${newUser._id}_${Date.now()}${ext}`;
        const finalPath = path.join(UPLOAD_DIR, finalName);
        fs.renameSync(req.file.path, finalPath);

        // Store relative path so it works regardless of server root
        const relPath = `uploads/profiles/${finalName}`;
        newUser.profileImage = relPath;
        await newUser.save();
      }

      return res.status(201).json(sanitize(newUser));
    } catch (err) {
      if (req.file) fs.unlink(req.file.path, () => {});
      console.error("Create user error:", err);
      return res.status(500).json({ message: "Failed to create user." });
    }
  },
);

// ── DELETE /api/users/:id ─────────────────────────────────────────────────────
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.role === "admin") {
      return res.status(403).json({ message: "Admin accounts cannot be deleted." });
    }

    // Remove profile photo from disk if present
    if (user.profileImage) {
      const filePath = path.join(__dirname, "..", user.profileImage);
      fs.unlink(filePath, () => {}); // non-fatal
    }

    await User.findByIdAndDelete(req.params.id);
    return res.json({ message: "User deleted successfully." });
  } catch (err) {
    return res.status(500).json({ message: "Failed to delete user." });
  }
});

module.exports = router;