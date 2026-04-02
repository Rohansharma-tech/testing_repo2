// =============================================
// routes/attendance.js - Attendance Routes
// =============================================

const express = require("express");
const router = express.Router();
const Attendance = require("../models/Attendance");
const User = require("../models/User");
const LeaveRequest = require("../models/LeaveRequest");
const Appeal = require("../models/Appeal");
const OrganizationSettings = require("../models/OrganizationSettings");
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

// ── Time comparison helpers ──────────────────────────────────────────────────

/**
 * Returns "HH:MM" for the current time in the org timezone.
 */
function getCurrentTimeHHMM(timeZone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

/**
 * Checks whether currentHHMM is within [startHHMM, endHHMM].
 * Returns: "before_window" | "within_window" | "after_window" | "no_window"
 */
function checkTimeWindow(currentHHMM, startHHMM, endHHMM) {
  if (!startHHMM && !endHHMM) return "no_window";
  if (startHHMM && currentHHMM < startHHMM) return "before_window";
  if (endHHMM && currentHHMM > endHHMM) return "after_window";
  return "within_window";
}

// ── Other helpers ────────────────────────────────────────────────────────────

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
    userDepartment: populatedUser ? (record.userId.department || null) : undefined,
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

async function upsertAttendanceRecord({ userId, status, reason = null, source = "normal", location, distanceMeters = null, dateParts, extraFields = {} }) {
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
    source,
    markedAt: status === ATTENDANCE_STATUS.PRESENT ? dateParts.now : null,
    ...extraFields,
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

/**
 * Fetches the pending re-validation appeal for a user ON a given re-validation date.
 * NOTE: we match against appeal.appealDate (the date the admin set for re-validation),
 * NOT appeal.date (which is the original absence date — a different day).
 */
async function getPendingRevalidationAppeal(userId, date) {
  return Appeal.findOne({
    userId,
    appealDate: date,          // ← re-validation date, not original absence date
    status: "approved",
    requiresRevalidation: true,
    revalidationStatus: "pending",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/attendance/location-check
// ─────────────────────────────────────────────────────────────────────────────
router.post("/location-check", async (req, res) => {
  try {
    const settings = await OrganizationSettings.getSingleton();
    const geofence = getGeofenceConfig(settings);

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

    const dateParts = getDateTimeParts();
    const existingRecord = await Attendance.findOne({ userId: req.user.id, date: dateParts.date });

    if (existingRecord?.status === ATTENDANCE_STATUS.PRESENT) {
      return res.json({
        allowed: true,
        alreadyMarked: true,
        record: serializeAttendanceRecord(existingRecord),
      });
    }

    // ── Attendance time window check ──────────────────────────────────────────
    const timeZone = settings.cutoffTimeZone || process.env.APP_TIMEZONE || "Asia/Kolkata";
    const currentHHMM = getCurrentTimeHHMM(timeZone);

    // Check if user has a pending re-validation appeal FIRST.
    // A re-validation appeal overrides the autoMarked block — the admin explicitly
    // granted a new window so the cutoff sentinel must not prevent it.
    const revalAppeal = await getPendingRevalidationAppeal(req.user.id, dateParts.date);

    if (revalAppeal) {
      // Appeal re-validation window governs this user today
      const windowStatus = checkTimeWindow(currentHHMM, revalAppeal.appealStartTime, revalAppeal.appealEndTime);
      if (windowStatus === "before_window") {
        return res.status(403).json({
          allowed: false,
          code: "window_not_open",
          message: `Your re-validation window has not opened yet. Please come back at ${revalAppeal.appealStartTime}.`,
          appealWindowStart: revalAppeal.appealStartTime,
          appealWindowEnd: revalAppeal.appealEndTime,
        });
      }
      if (windowStatus === "after_window") {
        return res.status(403).json({
          allowed: false,
          code: "window_closed",
          message: "Your re-validation window has closed. Penalty may be applied.",
          appealWindowStart: revalAppeal.appealStartTime,
          appealWindowEnd: revalAppeal.appealEndTime,
        });
      }
      // within_window — fall through to location/face check
    } else {
      // No re-validation appeal — apply the autoMarked guard for normal flow
      if (existingRecord?.autoMarked === true) {
        return res.status(403).json({
          allowed: false,
          code: "cutoff_passed",
          message: "The attendance window has closed for today.",
          detail: "You were automatically marked absent at the cutoff time. Please contact your administrator.",
          record: serializeAttendanceRecord(existingRecord),
        });
      }

      // Normal global attendance window check
      const windowStatus = checkTimeWindow(currentHHMM, settings.attendanceStartTime, settings.attendanceEndTime);
      if (windowStatus === "before_window") {
        return res.status(403).json({
          allowed: false,
          code: "window_not_open",
          message: `Attendance window has not opened yet. Please come back at ${settings.attendanceStartTime}.`,
          windowStart: settings.attendanceStartTime,
          windowEnd: settings.attendanceEndTime,
        });
      }
      if (windowStatus === "after_window") {
        return res.status(403).json({
          allowed: false,
          code: "window_closed",
          message: "The attendance window is now closed for today.",
          windowStart: settings.attendanceStartTime,
          windowEnd: settings.attendanceEndTime,
        });
      }
    }
    // ── End window check ──────────────────────────────────────────────────────

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
    console.error("location-check error:", err);
    return res.status(500).json({ message: "Server error while validating location.", allowed: false });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/attendance/mark
// ─────────────────────────────────────────────────────────────────────────────
router.post("/mark", async (req, res) => {
  try {
    const settings = await OrganizationSettings.getSingleton();
    const geofence = getGeofenceConfig(settings);

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

    // ── Attendance time window check ──────────────────────────────────────────
    const timeZone = settings.cutoffTimeZone || process.env.APP_TIMEZONE || "Asia/Kolkata";
    const currentHHMM = getCurrentTimeHHMM(timeZone);

    // Check re-validation appeal FIRST — overrides autoMarked block
    const revalAppeal = await getPendingRevalidationAppeal(req.user.id, dateParts.date);

    if (revalAppeal) {
      // Appeal re-validation window
      const windowStatus = checkTimeWindow(currentHHMM, revalAppeal.appealStartTime, revalAppeal.appealEndTime);
      if (windowStatus === "before_window") {
        return res.status(403).json({
          code: "window_not_open",
          message: `Your re-validation window has not opened yet. Please come back at ${revalAppeal.appealStartTime}.`,
          appealWindowStart: revalAppeal.appealStartTime,
          appealWindowEnd: revalAppeal.appealEndTime,
        });
      }
      if (windowStatus === "after_window") {
        return res.status(403).json({
          code: "window_closed",
          message: "Your re-validation window has closed. Penalty may be applied.",
          appealWindowStart: revalAppeal.appealStartTime,
          appealWindowEnd: revalAppeal.appealEndTime,
        });
      }
      // within_window — fall through to location/face check
    } else {
      // No re-validation appeal — apply normal autoMarked guard
      if (existingRecord?.autoMarked === true) {
        return res.status(403).json({
          code: "cutoff_passed",
          message: "The attendance window has closed for today.",
          detail: "You were automatically marked absent at the cutoff time. Please contact your administrator.",
          record: serializeAttendanceRecord(existingRecord),
        });
      }

      // Normal global attendance window check
      const windowStatus = checkTimeWindow(currentHHMM, settings.attendanceStartTime, settings.attendanceEndTime);
      if (windowStatus === "before_window") {
        return res.status(403).json({
          code: "window_not_open",
          message: `Attendance window has not opened yet. Please come back at ${settings.attendanceStartTime}.`,
          windowStart: settings.attendanceStartTime,
          windowEnd: settings.attendanceEndTime,
        });
      }
      if (windowStatus === "after_window") {
        return res.status(403).json({
          code: "window_closed",
          message: "The attendance window is now closed for today.",
          windowStart: settings.attendanceStartTime,
          windowEnd: settings.attendanceEndTime,
        });
      }
    }
    // ── End window check ──────────────────────────────────────────────────────

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

    // Determine source: re-validation vs normal
    const attendanceSource = revalAppeal ? "appeal_approval" : "normal";
    const extraFields = revalAppeal ? { adminApproved: true } : {};

    const record = await upsertAttendanceRecord({
      userId: req.user.id,
      status: ATTENDANCE_STATUS.PRESENT,
      reason: null,
      source: attendanceSource,
      location: validation.location,
      distanceMeters,
      dateParts,
      extraFields,
    });

    // If this was a re-validation, mark the appeal as completed
    if (revalAppeal) {
      await Appeal.updateOne(
        { _id: revalAppeal._id },
        { $set: { revalidationStatus: "completed" } }
      );
    }

    return res.status(existingRecord ? 200 : 201).json({
      message: "Attendance marked successfully.",
      record: serializeAttendanceRecord(record),
      updatedFrom: existingRecord?.status || null,
      wasRevalidation: Boolean(revalAppeal),
    });
  } catch (err) {
    console.error("mark attendance error:", err);
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
    const [record, settings] = await Promise.all([
      Attendance.findOne({ userId: req.user.id, date: dateParts.date }),
      OrganizationSettings.getSingleton(),
    ]);

    // Check if user has a pending re-validation appeal
    const revalAppeal = await getPendingRevalidationAppeal(req.user.id, dateParts.date);

    // A user with an active re-validation appeal must NOT be treated as cutoff-blocked,
    // even if autoMarked=true was set by the cron earlier — that's the whole point of the
    // appeal approval granting a new window.
    const cutoffPassed = record?.autoMarked === true && !revalAppeal;
    const alreadyPresent = record?.status === ATTENDANCE_STATUS.PRESENT;

    // Build window info for the frontend
    const timeZone = settings.cutoffTimeZone || process.env.APP_TIMEZONE || "Asia/Kolkata";
    const currentHHMM = getCurrentTimeHHMM(timeZone);

    let windowInfo = null;
    if (revalAppeal) {
      const windowStatus = checkTimeWindow(currentHHMM, revalAppeal.appealStartTime, revalAppeal.appealEndTime);
      windowInfo = {
        type: "appeal_revalidation",
        startTime: revalAppeal.appealStartTime,
        endTime: revalAppeal.appealEndTime,
        status: windowStatus,
        appealId: revalAppeal._id,
      };
    } else if (settings.attendanceStartTime || settings.attendanceEndTime) {
      const windowStatus = checkTimeWindow(currentHHMM, settings.attendanceStartTime, settings.attendanceEndTime);
      windowInfo = {
        type: "normal",
        startTime: settings.attendanceStartTime,
        endTime: settings.attendanceEndTime,
        status: windowStatus,
      };
    }

    return res.json({
      hasRecord: Boolean(record),
      marked: alreadyPresent,
      status: record?.status || "not_marked",
      canRetry: !record || (!alreadyPresent && !cutoffPassed),
      cutoffPassed,
      record: serializeAttendanceRecord(record),
      windowInfo,
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error." });
  }
});

// ---- GET /api/attendance/all ----
router.get("/all", adminOnly, async (req, res) => {
  try {
    const records = await Attendance.find()
      .populate({
        path: "userId",
        match: { isDeleted: { $ne: true } },
        select: "name email department profileImage",
      })
      .sort({ date: -1, createdAt: -1 });

    // Remove records whose user has been soft-deleted
    const visible = records.filter((r) => r.userId !== null);
    return res.json(visible.map((r) => serializeAttendanceRecord(r)));
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch attendance records." });
  }
});

// ---- GET /api/attendance/stats ----
router.get("/stats", adminOnly, async (req, res) => {
  try {
    const dateParts = getDateTimeParts();
    const totalUsers = await User.countDocuments({ role: "user", isDeleted: { $ne: true } });
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