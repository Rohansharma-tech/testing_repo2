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

/**
 * Detect which session is currently active based on configured windows.
 * Returns: { session: "morning"|"evening"|null, windowStatus, startTime, endTime }
 *
 * Logic:
 *   - If current time is within the morning window → morning
 *   - Else if current time is within the evening window → evening
 *   - If current time is before morning window → morning (not yet open)
 *   - If current time is between morning end and evening start → evening (not yet open)
 *   - If current time is after evening end → null (both closed)
 *   - If only morning is configured and window is open → morning
 *   - If only evening is configured and window is open → evening
 */
function detectCurrentSession(settings, currentHHMM) {
  const hasMorning = settings.attendanceStartTime || settings.attendanceEndTime;
  const hasEvening = settings.eveningStartTime || settings.eveningEndTime;

  if (!hasMorning && !hasEvening) {
    // No sessions configured — fall back to single "morning" session, no_window
    return { session: "morning", windowStatus: "no_window", startTime: null, endTime: null };
  }

  if (hasMorning && !hasEvening) {
    // Only morning configured
    const status = checkTimeWindow(currentHHMM, settings.attendanceStartTime, settings.attendanceEndTime);
    return { session: "morning", windowStatus: status, startTime: settings.attendanceStartTime, endTime: settings.attendanceEndTime };
  }

  if (!hasMorning && hasEvening) {
    // Only evening configured
    const status = checkTimeWindow(currentHHMM, settings.eveningStartTime, settings.eveningEndTime);
    return { session: "evening", windowStatus: status, startTime: settings.eveningStartTime, endTime: settings.eveningEndTime };
  }

  // Both sessions configured
  const morningStatus = checkTimeWindow(currentHHMM, settings.attendanceStartTime, settings.attendanceEndTime);
  const eveningStatus = checkTimeWindow(currentHHMM, settings.eveningStartTime, settings.eveningEndTime);

  if (morningStatus === "within_window") {
    return { session: "morning", windowStatus: "within_window", startTime: settings.attendanceStartTime, endTime: settings.attendanceEndTime };
  }
  if (eveningStatus === "within_window") {
    return { session: "evening", windowStatus: "within_window", startTime: settings.eveningStartTime, endTime: settings.eveningEndTime };
  }
  if (morningStatus === "before_window") {
    // Before morning window opens — morning session pending
    return { session: "morning", windowStatus: "before_window", startTime: settings.attendanceStartTime, endTime: settings.attendanceEndTime };
  }
  if (eveningStatus === "before_window") {
    // Morning closed, waiting for evening
    return { session: "evening", windowStatus: "before_window", startTime: settings.eveningStartTime, endTime: settings.eveningEndTime };
  }
  // Both windows have closed
  return { session: "evening", windowStatus: "after_window", startTime: settings.eveningStartTime, endTime: settings.eveningEndTime };
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
    session: record.session || "morning",
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

async function upsertAttendanceRecord({ userId, session, status, reason = null, source = "normal", location, distanceMeters = null, dateParts, extraFields = {} }) {
  const payload = {
    userId,
    date: dateParts.date,
    session,
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
    { userId, date: dateParts.date, session },
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
 * Fetches the pending re-validation appeal for a user ON a given re-validation date,
 * for a specific session. Session-aware so morning and evening appeals are independent.
 */
async function getPendingRevalidationAppeal(userId, date, session = "morning") {
  return Appeal.findOne({
    userId,
    appealDate: date,
    status: "approved",
    requiresRevalidation: true,
    revalidationStatus: "pending",
    session,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/attendance/location-check
// ─────────────────────────────────────────────────────────────────────────────
router.post("/location-check", async (req, res) => {
  try {
    const settings = await OrganizationSettings.findOne({ _singleton: "global" }).lean() || {};
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
    const timeZone = settings.cutoffTimeZone || process.env.APP_TIMEZONE || "Asia/Kolkata";
    const currentHHMM = getCurrentTimeHHMM(timeZone);

    // ── Half-day leave check ──────────────────────────────────────────────────
    const halfDayLeave = await LeaveRequest.findOne({
      userId: req.user.id,
      date: dateParts.date,
      status: "approved",
      type: "half_day",
    }).lean();
    // ── End half-day check ────────────────────────────────────────────────────

    const sessionInfo = detectCurrentSession(settings, currentHHMM);
    // Half-day leave: required session is the OPPOSITE of the leave session
    // morning leave → must attend evening; evening leave → must attend morning
    const requiredSession = halfDayLeave
      ? (halfDayLeave.halfDaySession === "morning" ? "evening" : "morning")
      : sessionInfo.session;
    const session = halfDayLeave ? requiredSession : sessionInfo.session;
    const effectiveSessionInfo = halfDayLeave
      ? { ...sessionInfo, session: requiredSession }
      : sessionInfo;

    const existingRecord = await Attendance.findOne({ userId: req.user.id, date: dateParts.date, session });

    if (existingRecord?.status === ATTENDANCE_STATUS.PRESENT) {
      return res.json({
        allowed: true,
        alreadyMarked: true,
        session,
        halfDayLeave: !!halfDayLeave,
        record: serializeAttendanceRecord(existingRecord),
      });
    }

    // ── Attendance time window check ──────────────────────────────────────────
    const revalAppeal = await getPendingRevalidationAppeal(req.user.id, dateParts.date, session);

    if (revalAppeal) {
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
    } else {
      if (existingRecord?.autoMarked === true) {
        return res.status(403).json({
          allowed: false,
          code: "cutoff_passed",
          message: "The attendance window has closed for today.",
          detail: "You were automatically marked absent at the cutoff time. Please contact your administrator.",
          record: serializeAttendanceRecord(existingRecord),
        });
      }

      if (effectiveSessionInfo.windowStatus === "before_window") {
        return res.status(403).json({
          allowed: false,
          code: "window_not_open",
          message: `${session === "morning" ? "Work Start" : "Work End"} attendance window has not opened yet. Please come back at ${effectiveSessionInfo.startTime}.`,
          session,
          windowStart: effectiveSessionInfo.startTime,
          windowEnd: effectiveSessionInfo.endTime,
        });
      }
      if (effectiveSessionInfo.windowStatus === "after_window") {
        return res.status(403).json({
          allowed: false,
          code: "window_closed",
          message: `The ${session === "morning" ? "Work Start" : "Work End"} attendance window is now closed for today.`,
          session,
          windowStart: effectiveSessionInfo.startTime,
          windowEnd: effectiveSessionInfo.endTime,
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
        session,
        status: ATTENDANCE_STATUS.ABSENT,
        reason: ATTENDANCE_REASON.OUTSIDE_LOCATION,
        location: validation.location,
        distanceMeters,
        dateParts,
      });
      return blockedAttendanceResponse(res, record, distanceMeters, geofence);
    }

    return res.json({ allowed: true, session, halfDayLeave: !!halfDayLeave, distanceMeters, radius: geofence.radius });
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
    // Always fetch a fresh lean object — getSingleton() can return a stale Mongoose document
    const settings = await OrganizationSettings.findOne({ _singleton: "global" }).lean() || {};
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
    const timeZone = settings.cutoffTimeZone || process.env.APP_TIMEZONE || "Asia/Kolkata";
    const currentHHMM = getCurrentTimeHHMM(timeZone);

    // ── Half-day leave check ─────────────────────────────────────────
    const halfDayLeave = await LeaveRequest.findOne({
      userId: req.user.id,
      date: dateParts.date,
      status: "approved",
      type: "half_day",
    }).lean();

    // If half-day leave: stamp the LEAVE session as "leave", then force the REQUIRED session
    // morning leave → stamp morning as leave, user must attend evening
    // evening leave → stamp evening as leave, user must attend morning
    if (halfDayLeave) {
      const leaveSession = halfDayLeave.halfDaySession || "morning";
      const leaveSessionFields = {
        userId: req.user.id,
        date: dateParts.date,
        session: leaveSession,
        time: dateParts.time,
        status: "leave",
        reason: "half_day_leave",
        source: "leave",
        adminApproved: true,
        autoMarked: false,
        penalty: false,
        latitude: null,
        longitude: null,
        distanceFromGeofence: null,
        locationAccuracy: null,
        locationTimestamp: dateParts.now,
        markedAt: null,
      };
      await Attendance.findOneAndUpdate(
        { userId: req.user.id, date: dateParts.date, session: leaveSession },
        { $set: leaveSessionFields },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
    // ── End half-day check ───────────────────────────────────────────────

    // Detect session: half-day leave forces the OPPOSITE of the leave session
    const sessionInfo = detectCurrentSession(settings, currentHHMM);
    const session = halfDayLeave
      ? (halfDayLeave.halfDaySession === "morning" ? "evening" : "morning")
      : sessionInfo.session;

    const existingRecord = await Attendance.findOne({ userId: req.user.id, date: dateParts.date, session });

    if (existingRecord?.status === ATTENDANCE_STATUS.PRESENT) {
      return res.status(409).json({
        message: `${session === "morning" ? "Morning" : "Evening"} attendance already marked for today.`,
        alreadyMarked: true,
        session,
        record: serializeAttendanceRecord(existingRecord),
      });
    }

    // ── Attendance time window check ──────────────────────────────────────────
    const revalAppeal = await getPendingRevalidationAppeal(req.user.id, dateParts.date, session);

    if (revalAppeal) {
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
    } else {
      if (existingRecord?.autoMarked === true) {
        return res.status(403).json({
          code: "cutoff_passed",
          message: "The attendance window has closed for today.",
          detail: "You were automatically marked absent at the cutoff time. Please contact your administrator.",
          record: serializeAttendanceRecord(existingRecord),
        });
      }

      if (sessionInfo.windowStatus === "before_window") {
        return res.status(403).json({
          code: "window_not_open",
          message: `${session === "morning" ? "Morning" : "Evening"} attendance window has not opened yet. Please come back at ${sessionInfo.startTime}.`,
          session,
          windowStart: sessionInfo.startTime,
          windowEnd: sessionInfo.endTime,
        });
      }
      if (sessionInfo.windowStatus === "after_window") {
        return res.status(403).json({
          code: "window_closed",
          message: `The ${session === "morning" ? "morning" : "evening"} attendance window is now closed for today.`,
          session,
          windowStart: sessionInfo.startTime,
          windowEnd: sessionInfo.endTime,
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
        session,
        status: ATTENDANCE_STATUS.ABSENT,
        reason: ATTENDANCE_REASON.OUTSIDE_LOCATION,
        location: validation.location,
        distanceMeters,
        dateParts,
      });
      return blockedAttendanceResponse(res, record, distanceMeters, geofence);
    }

    const attendanceSource = revalAppeal ? "appeal_approval" : "normal";
    const extraFields = revalAppeal ? { adminApproved: true } : {};

    const record = await upsertAttendanceRecord({
      userId: req.user.id,
      session,
      status: ATTENDANCE_STATUS.PRESENT,
      reason: null,
      source: attendanceSource,
      location: validation.location,
      distanceMeters,
      dateParts,
      extraFields,
    });

    if (revalAppeal) {
      await Appeal.updateOne(
        { _id: revalAppeal._id },
        { $set: { revalidationStatus: "completed" } }
      );
    }

    return res.status(existingRecord ? 200 : 201).json({
      message: "Attendance marked successfully.",
      record: serializeAttendanceRecord(record),
      session,
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
      .sort({ date: -1, session: 1, createdAt: -1 })
      .limit(60); // 30 days × 2 sessions
    return res.json(records.map((r) => serializeAttendanceRecord(r)));
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch your attendance." });
  }
});

// ---- GET /api/attendance/today ----
router.get("/today", async (req, res) => {
  try {
    const dateParts = getDateTimeParts();
    // Fetch attendance records, settings, and half-day leave in parallel.
    const [allTodayRecords, settings, halfDayLeave] = await Promise.all([
      Attendance.find({ userId: req.user.id, date: dateParts.date }),
      OrganizationSettings.findOne({ _singleton: "global" }).lean(),
      LeaveRequest.findOne({
        userId: req.user.id,
        date: dateParts.date,
        status: "approved",
        type: "half_day",
      }).lean(),
    ]);

    const morningRecord = allTodayRecords.find((r) => r.session === "morning") || null;
    const eveningRecord = allTodayRecords.find((r) => r.session === "evening") || null;

    const safeSettings = settings || {};
    const timeZone = safeSettings.cutoffTimeZone || process.env.APP_TIMEZONE || "Asia/Kolkata";
    const currentHHMM = getCurrentTimeHHMM(timeZone);

    // ── Half-day leave flags ────────────────────────────────────────────────────
    // morning leave → morning is waived, must attend evening
    // evening leave → evening is waived, must attend morning
    const leaveSession = halfDayLeave?.halfDaySession || "morning";
    const morningIsLeave = leaveSession === "morning"
      ? (!!halfDayLeave || morningRecord?.reason === "half_day_leave" || morningRecord?.status === "leave")
      : (morningRecord?.reason === "half_day_leave" || morningRecord?.status === "leave");
    const eveningIsLeave = leaveSession === "evening"
      ? (!!halfDayLeave || eveningRecord?.reason === "half_day_leave" || eveningRecord?.status === "leave")
      : (eveningRecord?.reason === "half_day_leave" || eveningRecord?.status === "leave");

    const sessionInfo = detectCurrentSession(safeSettings, currentHHMM);
    // If half-day leave, active session = OPPOSITE of the leave session
    const activeSession = halfDayLeave
      ? (leaveSession === "morning" ? "evening" : "morning")
      : sessionInfo.session;

    // ── Re-validation appeal check (session-aware) ──────────────────────────────
    // Must be after activeSession is known so we look up the right session's appeal.
    const revalAppeal = await getPendingRevalidationAppeal(req.user.id, dateParts.date, activeSession);

    // The "current" record is the one for the active session
    const currentRecord = activeSession === "evening" ? eveningRecord : morningRecord;

    const cutoffPassed = currentRecord?.autoMarked === true && !revalAppeal;
    const morningMarked = morningRecord?.status === ATTENDANCE_STATUS.PRESENT || morningIsLeave;
    const eveningMarked = eveningRecord?.status === ATTENDANCE_STATUS.PRESENT || eveningIsLeave;

    const hasMorning = Boolean(settings.attendanceStartTime || settings.attendanceEndTime);
    const hasEvening = Boolean(settings.eveningStartTime || settings.eveningEndTime);
    const bothRequired = hasMorning && hasEvening;
    // Half-day: leave session is waived - only the required (opposite) session counts for completion
    const allSessionsComplete = halfDayLeave
      ? (leaveSession === "morning"
        ? eveningRecord?.status === ATTENDANCE_STATUS.PRESENT   // morning leave -> need evening present
        : morningRecord?.status === ATTENDANCE_STATUS.PRESENT)  // evening leave -> need morning present
      : bothRequired
        ? morningMarked && eveningMarked
        : morningMarked || eveningMarked;

    // Build window info for the frontend
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
    } else if (sessionInfo.windowStatus !== "no_window") {
      windowInfo = {
        type: activeSession === "morning" ? "morning" : "evening",
        session: activeSession,
        startTime: sessionInfo.startTime,
        endTime: sessionInfo.endTime,
        status: sessionInfo.windowStatus,
        // Include both session configs for the frontend to display context
        morningStartTime: settings.attendanceStartTime,
        morningEndTime: settings.attendanceEndTime,
        eveningStartTime: settings.eveningStartTime,
        eveningEndTime: settings.eveningEndTime,
        bothSessionsEnabled: bothRequired,
      };
    }

    return res.json({
      hasRecord: Boolean(currentRecord),
      marked: Boolean(currentRecord?.status === ATTENDANCE_STATUS.PRESENT),
      allSessionsComplete,
      status: currentRecord?.status || "not_marked",
      canRetry: !currentRecord || (currentRecord.status !== ATTENDANCE_STATUS.PRESENT && !cutoffPassed),
      cutoffPassed,
      activeSession,
      halfDayLeave: !!halfDayLeave,
      halfDayLeaveSession: halfDayLeave?.halfDaySession ?? null,
      morningIsLeave,
      eveningIsLeave,
      morningRecord: serializeAttendanceRecord(morningRecord),
      eveningRecord: serializeAttendanceRecord(eveningRecord),
      record: serializeAttendanceRecord(currentRecord),
      windowInfo,
      // Session config summary
      sessions: {
        morning: {
          enabled: hasMorning,
          marked: morningMarked,
          isLeave: morningIsLeave,
          startTime: settings.attendanceStartTime,
          endTime: settings.attendanceEndTime,
        },
        evening: {
          enabled: hasEvening,
          marked: eveningMarked,
          isLeave: eveningIsLeave,
          startTime: settings.eveningStartTime,
          endTime: settings.eveningEndTime,
        },
      },
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
      .sort({ date: -1, session: 1, createdAt: -1 });

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
    const morningPresentToday = await Attendance.countDocuments({ date: dateParts.date, session: "morning", status: ATTENDANCE_STATUS.PRESENT });
    const eveningPresentToday = await Attendance.countDocuments({ date: dateParts.date, session: "evening", status: ATTENDANCE_STATUS.PRESENT });
    const presentToday = await Attendance.countDocuments({ date: dateParts.date, status: ATTENDANCE_STATUS.PRESENT });
    const absentToday = await Attendance.countDocuments({ date: dateParts.date, status: ATTENDANCE_STATUS.ABSENT });
    const outsideLocationToday = await Attendance.countDocuments({ date: dateParts.date, reason: ATTENDANCE_REASON.OUTSIDE_LOCATION });
    const totalRecords = await Attendance.countDocuments();

    return res.json({
      totalUsers,
      presentToday,
      morningPresentToday,
      eveningPresentToday,
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