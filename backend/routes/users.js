// =============================================
// routes/users.js — User Management (Admin)
// =============================================

const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const multer = require("multer");
const User = require("../models/User");
const EmployeeCounter = require("../models/EmployeeCounter");
const Department = require("../models/Department");
const { protect, adminOnly } = require("../middleware/auth");
const { uploadToGridFS, deleteFromGridFS } = require("../utils/gridfs");
const { PROFILE_ALLOWED, multerMimeFilter, validateMagicBytes } = require("../utils/fileValidation");
const sharp = require("sharp");

// ── Image resize ──────────────────────────────────────────────────────────────
/**
 * Resize any incoming profile image to a 300×300 JPEG (cover crop).
 * - Forces consistent dimensions across all avatars
 * - Converts WEBP/PNG to JPEG for uniform storage
 * - Reduces file size significantly before storing in MongoDB GridFS
 *
 * @param {Buffer} inputBuffer — raw file buffer from multer
 * @returns {Promise<Buffer>}   — resized JPEG buffer
 */
async function resizeProfileImage(inputBuffer) {
  return sharp(inputBuffer)
    .resize(300, 300, { fit: "cover", position: "centre" })
    .jpeg({ quality: 85, progressive: true })
    .toBuffer();
}

// ── Multer: memory storage + MIME filter ─────────────────────────────────────
// Files are buffered in memory for magic-byte validation, then streamed to GridFS.
// Max size: 2 MB (as per security requirements).
const profileUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: multerMimeFilter(PROFILE_ALLOWED),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
}).single("profileImage");

function runProfileUpload(req, res) {
  return new Promise((resolve, reject) => {
    profileUpload(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

// ── Atomic Employee ID Generation ─────────────────────────────────────────────
async function generateEmployeeId(departmentName, dateOfJoin) {
  let deptCode;
  if (!departmentName) {
    deptCode = "PRIN";
  } else {
    const dept = await Department.findOne({ name: departmentName });
    deptCode = dept?.code || departmentName.replace(/\s+/g, "").slice(0, 3).toUpperCase() || "GEN";
  }
  const year = new Date(dateOfJoin).getFullYear().toString().slice(-2);
  const key = `${deptCode}-${year}`;
  const counter = await EmployeeCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  const seq = String(counter.seq).padStart(3, "0");
  return `${deptCode}${year}${seq}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build the profile image URL from the stored GridFS fileId.
 * Returns an absolute URL so any device can load the image.
 */
function profileImageUrl(fileId) {
  if (!fileId) return null;
  const base = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  return `${base}/api/files/${fileId}`;
}

function sanitize(user) {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  delete obj.faceDescriptor;
  obj.profileImageUrl = profileImageUrl(obj.profileImage);
  return obj;
}

function stripClientForbiddenFields(body) {
  delete body.employeeId;
  delete body.hasFace;
  delete body.faceDescriptor;
  delete body.isDeleted;
  delete body.deletedAt;
}

// ── GET /api/users ─────────────────────────────────────────────────────────────
router.get("/", protect, async (req, res) => {
  const role = req.user.role;
  if (role !== "admin" && role !== "principal") {
    return res.status(403).json({ message: "Access denied." });
  }
  try {
    const users = await User.find({ isDeleted: { $ne: true } })
      .select("-password -faceDescriptor")
      .sort({ createdAt: -1 });
    const result = users.map((u) => {
      const obj = u.toObject();
      obj.profileImageUrl = profileImageUrl(obj.profileImage);
      return obj;
    });
    return res.json(result);
  } catch (err) {
    console.error("Fetch users error:", err);
    return res.status(500).json({ message: "Failed to fetch users." });
  }
});

// ── GET /api/users/departments ─────────────────────────────────────────────────
router.get("/departments", protect, async (req, res) => {
  try {
    const departments = await Department.find().sort({ name: 1 }).select("name code");
    return res.json(departments);
  } catch {
    return res.status(500).json({ message: "Failed to fetch departments." });
  }
});

// ── GET /api/users/:id ──────────────────────────────────────────────────────────
router.get("/:id", protect, async (req, res) => {
  const isSelf = req.params.id === req.user.id;
  const isAdmin = req.user.role === "admin";
  const isPrincipal = req.user.role === "principal";
  if (!isSelf && !isAdmin && !isPrincipal) {
    return res.status(403).json({ message: "Access denied." });
  }
  try {
    const user = await User.findById(req.params.id).select("-password -faceDescriptor");
    if (!user) return res.status(404).json({ message: "User not found." });
    const obj = user.toObject();
    obj.profileImageUrl = profileImageUrl(obj.profileImage);
    return res.json(obj);
  } catch (err) {
    console.error("Fetch user error:", err);
    return res.status(500).json({ message: "Failed to fetch user." });
  }
});

// ── GET /api/users/:id/avatar — Redirect to GridFS file URL ──────────────────
router.get("/:id/avatar", protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("profileImage");
    if (!user || !user.profileImage) return res.status(404).json({ message: "No avatar set." });
    return res.redirect(`/api/files/${user.profileImage}`);
  } catch {
    return res.status(500).json({ message: "Failed to fetch avatar." });
  }
});

// ── POST /api/users ─────────────────────────────────────────────────────────────
router.post("/", protect, adminOnly, async (req, res) => {
  // Step 1: parse multipart (memory storage)
  try { await runProfileUpload(req, res); }
  catch (err) { return res.status(400).json({ message: err.message }); }

  stripClientForbiddenFields(req.body);

  const {
    firstName, lastName, email, password, role, department,
    newDepartmentName, newDepartmentCode, dateOfJoin, dateOfBirth,
    nationality, gender, personalEmail, mobileNo,
    designation, location, employeeType,
  } = req.body;

  if (!firstName || !email || !password)
    return res.status(400).json({ message: "First name, email, and password are required." });
  if (!dateOfJoin)
    return res.status(400).json({ message: "Date of join is required." });
  if (password.length < 6)
    return res.status(400).json({ message: "Password must be at least 6 characters." });
  if (mobileNo && !/^\d{10}$/.test(mobileNo.trim()))
    return res.status(400).json({ message: "Mobile number must be exactly 10 digits." });

  // Step 2: magic-byte validation
  if (req.file) {
    const { ok, detected } = await validateMagicBytes(req.file.buffer, req.file.mimetype, PROFILE_ALLOWED);
    if (!ok)
      return res.status(415).json({ message: `File content does not match a supported image type (detected: ${detected ?? "unknown"}).` });
  }

  const resolvedRole = ["admin", "user", "hod", "principal"].includes(role) ? role : "user";

  try {
    let resolvedDeptName = null;

    if (resolvedRole === "principal") {
      resolvedDeptName = null;
    } else if (resolvedRole === "hod" && newDepartmentName) {
      const cleanName = newDepartmentName.trim();
      const cleanCode = (newDepartmentCode || "").trim().toUpperCase();
      if (!cleanCode || !/^[A-Z]{2,6}$/.test(cleanCode))
        return res.status(400).json({ message: "Department code must be 2–6 uppercase letters." });
      const existing = await Department.findOne({ $or: [{ name: cleanName }, { code: cleanCode }] });
      if (existing) {
        const field = existing.name === cleanName ? "name" : "code";
        return res.status(409).json({ message: `A department with that ${field} already exists.` });
      }
      const newDept = await Department.create({ name: cleanName, code: cleanCode });
      resolvedDeptName = newDept.name;
    } else if (department) {
      const existingDept = await Department.findOne({ name: department.trim() });
      if (!existingDept)
        return res.status(400).json({ message: `Department "${department}" does not exist.`, code: "DEPARTMENT_NOT_FOUND" });
      resolvedDeptName = existingDept.name;
    } else {
      return res.status(400).json({ message: "Department is required." });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser)
      return res.status(409).json({ message: "A user with that email already exists." });

    const hashedPassword = await bcrypt.hash(password, 10);
    const empId = await generateEmployeeId(resolvedDeptName, dateOfJoin);

    const newUser = await User.create({
      employeeId:    empId,
      firstName:     firstName.trim(),
      lastName:      (lastName || "").trim(),
      email:         email.toLowerCase().trim(),
      password:      hashedPassword,
      role:          resolvedRole,
      department:    resolvedDeptName,
      dateOfJoin:    dateOfJoin ? new Date(dateOfJoin) : null,
      dateOfBirth:   dateOfBirth ? new Date(dateOfBirth) : null,
      nationality:   nationality || "",
      gender:        gender || "",
      personalEmail: (personalEmail || "").toLowerCase().trim(),
      mobileNo:      (mobileNo || "").trim(),
      designation:   (designation || "").trim(),
      location:      (location || "").trim(),
      employeeType:  employeeType || "",
      profileImage:  null,
    });

    if (resolvedRole === "hod" && newDepartmentName) {
      await Department.findOneAndUpdate({ name: resolvedDeptName }, { createdBy: newUser._id });
    }

    // Step 3: Resize → Upload to GridFS
    if (req.file) {
      const resized = await resizeProfileImage(req.file.buffer);
      const fileId = await uploadToGridFS(
        resized,
        `profile_${newUser._id}.jpg`,
        "image/jpeg",
        { purpose: "profile", userId: String(newUser._id) }
      );
      newUser.profileImage = String(fileId);
      await newUser.save();
    }

    return res.status(201).json(sanitize(newUser));
  } catch (err) {
    console.error("Create user error:", err);
    if (err.code === 11000)
      return res.status(409).json({ message: "A user with that email or Employee ID already exists." });
    return res.status(500).json({ message: "Failed to create user." });
  }
});

// ── PUT /api/users/:id ──────────────────────────────────────────────────────────
// Admin: can edit any user (all fields)
// Self: can edit own profile (restricted fields only — no role/department changes)
router.put("/:id", protect, async (req, res) => {
  const isSelf  = req.params.id === req.user.id;
  const isAdmin = req.user.role === "admin";
  if (!isSelf && !isAdmin)
    return res.status(403).json({ message: "Access denied. You can only edit your own profile." });

  // Step 1: parse multipart
  try { await runProfileUpload(req, res); }
  catch (err) { return res.status(400).json({ message: err.message }); }

  stripClientForbiddenFields(req.body);

  const {
    firstName, lastName, email, password, role, department,
    dateOfJoin, dateOfBirth, nationality, gender, personalEmail,
    mobileNo, designation, location, employeeType,
  } = req.body;

  if (mobileNo && !/^\d{10}$/.test(mobileNo.trim()))
    return res.status(400).json({ message: "Mobile number must be exactly 10 digits." });

  // Step 2: magic-byte validation
  if (req.file) {
    const { ok, detected } = await validateMagicBytes(req.file.buffer, req.file.mimetype, PROFILE_ALLOWED);
    if (!ok)
      return res.status(415).json({ message: `File content does not match a supported image type (detected: ${detected ?? "unknown"}).` });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.isDeleted) return res.status(400).json({ message: "Cannot edit a deactivated user." });
    if (user.role === "admin" && user._id.toString() !== req.user.id)
      return res.status(403).json({ message: "Admin accounts cannot be edited by other admins." });

    if (firstName    !== undefined) user.firstName    = firstName.trim();
    if (lastName     !== undefined) user.lastName     = (lastName || "").trim();
    if (designation  !== undefined) user.designation  = (designation || "").trim();
    if (location     !== undefined) user.location     = (location || "").trim();
    if (mobileNo     !== undefined) user.mobileNo     = (mobileNo || "").trim();
    if (nationality  !== undefined) user.nationality  = (nationality || "").trim();
    if (gender       !== undefined) user.gender       = gender || "";
    if (personalEmail !== undefined) user.personalEmail = (personalEmail || "").toLowerCase().trim();
    if (employeeType !== undefined) user.employeeType = employeeType || "";
    if (dateOfBirth  !== undefined) user.dateOfBirth  = dateOfBirth ? new Date(dateOfBirth) : null;
    if (dateOfJoin   !== undefined) user.dateOfJoin   = dateOfJoin  ? new Date(dateOfJoin)  : null;

    // Admin-only fields — ignored silently for self-edits
    if (isAdmin) {
      if (email && email.toLowerCase().trim() !== user.email) {
        const conflict = await User.findOne({ email: email.toLowerCase().trim() });
        if (conflict && conflict._id.toString() !== req.params.id)
          return res.status(409).json({ message: "A user with that email already exists." });
        user.email = email.toLowerCase().trim();
      }
      if (department !== undefined) user.department = department || null;
      if (role && ["user", "admin", "hod", "principal"].includes(role)) user.role = role;
    }

    if (password && password.trim().length > 0) {
      if (password.trim().length < 6)
        return res.status(400).json({ message: "Password must be at least 6 characters." });
      user.password = await bcrypt.hash(password.trim(), 10);
    }

    // Step 3: Replace profile image in GridFS (resize before storing)
    if (req.file) {
      await deleteFromGridFS(user.profileImage);

      const resized = await resizeProfileImage(req.file.buffer);
      const fileId = await uploadToGridFS(
        resized,
        `profile_${user._id}.jpg`,
        "image/jpeg",
        { purpose: "profile", userId: String(user._id) }
      );
      user.profileImage = String(fileId);
    }

    await user.save();
    return res.json(sanitize(user));
  } catch (err) {
    console.error("Edit user error:", err);
    return res.status(500).json({ message: "Failed to update user." });
  }
});

// ── DELETE /api/users/:id ──────────────────────────────────────────────────────
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.role === "admin")
      return res.status(403).json({ message: "Admin accounts cannot be deleted." });
    if (user.isDeleted)
      return res.status(409).json({ message: "User is already deactivated." });

    user.isDeleted = true;
    user.deletedAt = new Date();
    await user.save();

    return res.json({ message: "User deactivated successfully. Historical records are preserved." });
  } catch (err) {
    console.error("Soft-delete user error:", err);
    return res.status(500).json({ message: "Failed to deactivate user." });
  }
});

module.exports = router;