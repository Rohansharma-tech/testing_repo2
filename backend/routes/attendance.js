// =============================================
// routes/attendance.js - Attendance Routes
// =============================================

const express = require("express");
const router = express.Router();
const Attendance = require("../models/Attendance");
const User = require("../models/User");
const LeaveRequest = require("../models/LeaveRequest");
const Appeal = require("../models/Appeal");
const { protect, adminOnly } = require("../middleware/auth");
const {
  ATTENDANCE_REASON,
  ATTENDANCE_STATUS,
  getDateTimeParts,
  getGeofenceConfig,
  haversineDistance,
  validateLocationPayload,
} = require("../utils/attendance");

router.use(protect);

function isGeofenceConfigured(geofence) {
  return (
    Number.isFinite(geofence.latitude) &&
    Number.isFinite(geofence.longitude) &&
    Number.isFinite(geofence.radius) &&
    geofence.radius > 0
  );
}

function serializeAttendanceRecord(record) {
  if (!record) return null;

  const populatedUser = record.userId && typeof record.userId === "object" && record.userId._id;

  return {
    id: record._id,
    userId: populatedUser ? record.userId._id : record.userId,
    userName: populatedUser ? record.userId.name : undefined,
    userEmail: populatedUser ? record.userId.email : undefined,
    userDepartment: populatedUser ? (record.userId.department || null) : undefined, // ✅ FIX 2
    userProfileImage: populatedUser ? (record.userId.profileImage || null) : undefined,
    date: record.date,
    time: record.time,
    latitude: record.latitude,
    longitude: record.longitude,
    distanceMeters: record.distanceFromGeofence,
    locationAccuracy: record.locationAccuracy,
    locationTimestamp: record.locationTimestamp,
    status: record.status,
    reason: record.reason,
    penalty: record.penalty ?? false,
    source: record.source ?? "normal",
    autoMarked: record.autoMarked ?? false,
    adminApproved: record.adminApproved ?? false,
    markedAt: record.markedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function upsertAttendanceRecord({ userId, status, reason = null, location, distanceMeters = null, dateParts }) {
  const payload = {
    userId,
    date: dateParts.date,
    time: dateParts.time,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    distanceFromGeofence: distanceMeters,
    locationAccuracy: location?.accuracy ?? null,
    locationTimestamp: location?.capturedAt ?? dateParts.now,
    status,
    reason,
    markedAt: status === ATTENDANCE_STATUS.PRESENT ? dateParts.now : null,
  };

  return Attendance.findOneAndUpdate(
    { userId, date: dateParts.date },
    { $set: payload },
    { new: true, runValidators: true, setDefaultsOnInsert: true, upsert: true }
  );
}

function blockedAttendanceResponse(res, record, distanceMeters, geofence) {
  return res.status(403).json({
    allowed: false,
    message: "You are not in the allowed location",
    detail: `Current distance: ${distanceMeters}m. Allowed radius: ${Math.round(geofence.radius)}m.`,
    code: ATTENDANCE_REASON.OUTSIDE_LOCATION,
    distanceMeters,
    radius: geofence.radius,
    record: serializeAttendanceRecord(record),
  });
}

// ---- POST /api/attendance/location-check ----
router.post("/location-check", async (req, res) => {
  const geofence = getGeofenceConfig();
  if (!isGeofenceConfigured(geofence)) {
    return res.status(500).json({ message: "Geofence is not configured.", allowed: false });
  }

  const validation = validateLocationPayload(req.body, geofence);
  if (!validation.ok) {
    return res.status(validation.statusCode).json({
      allowed: false,
      message: validation.message,
      code: validation.code,
      detail: validation.detail,
      accuracyMeters: validation.accuracyMeters,
      requiredAccuracyMeters: validation.requiredAccuracyMeters,
    });
  }

  try {
    const dateParts = getDateTimeParts();
    const existingRecord = await Attendance.findOne({ userId: req.user.id, date: dateParts.date });

    if (existingRecord?.status === ATTENDANCE_STATUS.PRESENT) {
      return res.json({
        allowed: true,
        alreadyMarked: true,
        record: serializeAttendanceRecord(existingRecord),
      });
    }

    // Block if the auto-absent job has already finalised today's record
    if (existingRecord?.autoMarked === true) {
      return res.status(403).json({
        allowed: false,
        code: "cutoff_passed",
        message: "The attendance window has closed for today.",
        detail: "You were automatically marked absent at the cutoff time. Please contact your administrator.",
        record: serializeAttendanceRecord(existingRecord),
      });
    }

    const distanceMeters = Math.round(
      haversineDistance(
        validation.location.latitude,
        validation.location.longitude,
        geofence.latitude,
        geofence.longitude
      )
    );

    if (distanceMeters > geofence.radius) {
      const record = await upsertAttendanceRecord({
        userId: req.user.id,
        status: ATTENDANCE_STATUS.ABSENT,
        reason: ATTENDANCE_REASON.OUTSIDE_LOCATION,
        location: validation.location,
        distanceMeters,
        dateParts,
      });
      return blockedAttendanceResponse(res, record, distanceMeters, geofence);
    }

    return res.json({ allowed: true, distanceMeters, radius: geofence.radius });
  } catch (err) {
    return res.status(500).json({ message: "Server error while validating location.", allowed: false });
  }
});

// ---- POST /api/attendance/mark ----
router.post("/mark", async (req, res) => {
  const geofence = getGeofenceConfig();
  if (!isGeofenceConfigured(geofence)) {
    return res.status(500).json({ message: "Geofence is not configured." });
  }

  const validation = validateLocationPayload(req.body, geofence);
  if (!validation.ok) {
    return res.status(validation.statusCode).json({
      message: validation.message,
      code: validation.code,
      allowed: false,
      detail: validation.detail,
      accuracyMeters: validation.accuracyMeters,
      requiredAccuracyMeters: validation.requiredAccuracyMeters,
    });
  }

  try {
    const user = await User.findById(req.user.id).select("hasFace faceDescriptor");
    if (!user) return res.status(404).json({ message: "User not found." });
    if (!user.hasFace || !Array.isArray(user.faceDescriptor) || user.faceDescriptor.length === 0) {
      return res.status(403).json({ message: "Register your face before marking attendance." });
    }

    const dateParts = getDateTimeParts();
    const existingRecord = await Attendance.findOne({ userId: req.user.id, date: dateParts.date });

    if (existingRecord?.status === ATTENDANCE_STATUS.PRESENT) {
      return res.status(409).json({
        message: "Attendance already marked for today.",
        alreadyMarked: true,
        record: serializeAttendanceRecord(existingRecord),
      });
    }

    // Block if the auto-absent job has already finalised today's record
    if (existingRecord?.autoMarked === true) {
      return res.status(403).json({
        code: "cutoff_passed",
        message: "The attendance window has closed for today.",
        detail: "You were automatically marked absent at the cutoff time. Please contact your administrator.",
        record: serializeAttendanceRecord(existingRecord),
      });
    }

    const distanceMeters = Math.round(
      haversineDistance(
        validation.location.latitude,
        validation.location.longitude,
        geofence.latitude,
        geofence.longitude
      )
    );

    if (distanceMeters > geofence.radius) {
      const record = await upsertAttendanceRecord({
        userId: req.user.id,
        status: ATTENDANCE_STATUS.ABSENT,
        reason: ATTENDANCE_REASON.OUTSIDE_LOCATION,
        location: validation.location,
        distanceMeters,
        dateParts,
      });
      return blockedAttendanceResponse(res, record, distanceMeters, geofence);
    }

    const record = await upsertAttendanceRecord({
      userId: req.user.id,
      status: ATTENDANCE_STATUS.PRESENT,
      reason: null,
      location: validation.location,
      distanceMeters,
      dateParts,
    });

    return res.status(existingRecord ? 200 : 201).json({
      message: "Attendance marked successfully.",
      record: serializeAttendanceRecord(record),
      updatedFrom: existingRecord?.status || null,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error while marking attendance." });
  }
});

// ---- GET /api/attendance/my ----
router.get("/my", async (req, res) => {
  try {
    const records = await Attendance.find({ userId: req.user.id })
      .sort({ date: -1, createdAt: -1 })
      .limit(30);
    return res.json(records.map((r) => serializeAttendanceRecord(r)));
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch your attendance." });
  }
});

// ---- GET /api/attendance/today ----
router.get("/today", async (req, res) => {
  try {
    const dateParts = getDateTimeParts();
    const record = await Attendance.findOne({ userId: req.user.id, date: dateParts.date });
    // canRetry is false when: already PRESENT, or auto-absent (cutoff has passed)
    const cutoffPassed = record?.autoMarked === true;
    const alreadyPresent = record?.status === ATTENDANCE_STATUS.PRESENT;

    return res.json({
      hasRecord: Boolean(record),
      marked: alreadyPresent,
      status: record?.status || "not_marked",
      canRetry: !record || (!alreadyPresent && !cutoffPassed),
      cutoffPassed,
      record: serializeAttendanceRecord(record),
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error." });
  }
});

// ---- GET /api/attendance/all ----
router.get("/all", adminOnly, async (req, res) => {
  try {
    const records = await Attendance.find()
      .populate("userId", "name email department profileImage") // ✅ FIX 1: added "department" and "profileImage"
      .sort({ date: -1, createdAt: -1 });

    return res.json(records.map((r) => serializeAttendanceRecord(r)));
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch attendance records." });
  }
});

// ---- GET /api/attendance/stats ----
router.get("/stats", adminOnly, async (req, res) => {
  try {
    const dateParts = getDateTimeParts();
    const totalUsers = await User.countDocuments({ role: "user" });
    const presentToday = await Attendance.countDocuments({ date: dateParts.date, status: ATTENDANCE_STATUS.PRESENT });
    const absentToday = await Attendance.countDocuments({ date: dateParts.date, status: ATTENDANCE_STATUS.ABSENT });
    const outsideLocationToday = await Attendance.countDocuments({ date: dateParts.date, reason: ATTENDANCE_REASON.OUTSIDE_LOCATION });
    const totalRecords = await Attendance.countDocuments();

    return res.json({
      totalUsers,
      presentToday,
      absentToday,
      outsideLocationToday,
      pendingToday: Math.max(totalUsers - presentToday - absentToday, 0),
      totalRecords,
      date: dateParts.date,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch stats." });
  }
});

// ---- GET /api/attendance/pending-counts ----
router.get("/pending-counts", adminOnly, async (req, res) => {
  try {
    const leaveCount = await LeaveRequest.countDocuments({ status: "pending" });
    const appealCount = await Appeal.countDocuments({ status: "pending" });
    return res.json({ count: leaveCount + appealCount, leaves: leaveCount, appeals: appealCount });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch pending counts." });
  }
});

module.exports = router;