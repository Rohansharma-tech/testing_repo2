const express = require("express");
const router = express.Router();
const Appeal = require("../models/Appeal");
const Attendance = require("../models/Attendance");
const { protect, adminOnly } = require("../middleware/auth");
const { getDateTimeParts } = require("../utils/attendance");

router.use(protect);

// ---- POST /api/appeals (User applies for an appeal) ----
// Body: { date, reason, session }  session = "morning" | "evening" (default: "morning")
router.post("/", async (req, res) => {
  const { date, reason, session = "morning" } = req.body;

  if (!date || !reason) {
    return res.status(400).json({ message: "Date and reason are required." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: "date must be in YYYY-MM-DD format.", code: "INVALID_DATE_FORMAT" });
  }
  if (!["morning", "evening"].includes(session)) {
    return res.status(400).json({ message: "session must be 'morning' (Work Start) or 'evening' (Work End)." });
  }

  try {
    // ── Same-day validation (org timezone) ───────────────────────────────────
    // Appeals are only valid for the current calendar day in the org's timezone.
    // The employee must raise the appeal on the same day they were auto-absent.
    // Admin must act before midnight — any pending appeals are auto-rejected at
    // 00:01 the next day by the appeal expiry cron job.
    const OrganizationSettings = require("../models/OrganizationSettings");
    let timeZone = process.env.APP_TIMEZONE || "Asia/Kolkata";
    try {
      const settings = await OrganizationSettings.getSingleton();
      timeZone = settings.cutoffTimeZone || timeZone;
    } catch (_) { /* fall back to env / default */ }

    const { date: todayDate } = getDateTimeParts(new Date(), timeZone);
    if (date !== todayDate) {
      return res.status(400).json({
        message: `Appeals can only be submitted for today (${todayDate}). The window for appealing ${date} has closed — your attendance remains absent.`,
        code: "APPEAL_DATE_NOT_TODAY",
        allowedDate: todayDate,
      });
    }
    // ── End same-day validation ───────────────────────────────────────────────

    // 1. Verify that an Attendance record exists FOR THIS SESSION, is absent, and was auto-marked by cutoff.
    const attendance = await Attendance.findOne({ userId: req.user.id, date, session });
    const isCutoff =
      attendance &&
      (attendance.source === "cutoff" ||
        attendance.source === "auto_cutoff" ||
        attendance.reason === "auto_absent");

    if (!attendance || attendance.status !== "absent" || !isCutoff) {
      return res.status(400).json({
        message: `You can only appeal an auto-absent cutoff record. No eligible ${session === "evening" ? "Work End" : "Work Start"} record found for this date.`,
      });
    }

    // 2. Prevent duplicate appeal for the same date + session
    const existing = await Appeal.findOne({ userId: req.user.id, date, session });
    if (existing) {
      return res.status(409).json({
        message: `You have already appealed for the ${session === "evening" ? "Work End" : "Work Start"} session on this date.`,
      });
    }

    const appeal = await Appeal.create({
      userId: req.user.id,
      attendanceId: attendance._id,
      date,
      session,          // "morning" | "evening"
      reason,
      status: "pending",
    });

    return res.status(201).json({ message: "Appeal submitted successfully.", appeal });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "You have already appealed for this session on this date." });
    }
    return res.status(500).json({ message: "Server error while submitting appeal." });
  }
});

// ---- GET /api/appeals/my (User gets their appeals) ----
router.get("/my", async (req, res) => {
  try {
    const appeals = await Appeal.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json(appeals);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch your appeals." });
  }
});

// ---- GET /api/appeals/all (Admin gets all appeals) ----
router.get("/all", adminOnly, async (req, res) => {
  try {
    const appeals = await Appeal.find()
      .populate({
        path: "userId",
        match: { isDeleted: { $ne: true } },
        select: "name email department profileImage isDeleted",
      })
      .sort({ createdAt: -1 });
    const visible = appeals.filter((a) => a.userId !== null);
    return res.json(visible);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch appeals." });
  }
});

// ---- PUT /api/appeals/:id/status (Admin approves/rejects appeal) ----
//
// Body for simple approval:
//   { status: "approved", adminResponse: "..." }
//
// Body for approval WITH re-validation:
//   { status: "approved", requiresRevalidation: true, appealDate, appealStartTime, appealEndTime, adminResponse }
//
// Body for rejection:
//   { status: "rejected", adminResponse: "..." }
//
// Full-day absent rule:
//   If the appeal is for the MORNING (Work Start) session and is rejected,
//   the system also marks the EVENING (Work End) session as absent+penalty.
//
router.put("/:id/status", adminOnly, async (req, res) => {
  const { status, adminResponse, requiresRevalidation, appealStartTime, appealEndTime } = req.body;

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status." });
  }

  const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (status === "approved" && requiresRevalidation) {
    if (!appealStartTime || !TIME_RE.test(appealStartTime)) {
      return res.status(400).json({ message: "appealStartTime must be in HH:MM 24-hour format." });
    }
    if (!appealEndTime || !TIME_RE.test(appealEndTime)) {
      return res.status(400).json({ message: "appealEndTime must be in HH:MM 24-hour format." });
    }
    if (appealStartTime >= appealEndTime) {
      return res.status(400).json({ message: "appealStartTime must be earlier than appealEndTime." });
    }
  }

  try {
    const appeal = await Appeal.findById(req.params.id);
    if (!appeal) return res.status(404).json({ message: "Appeal not found." });

    if (appeal.status !== "pending") {
      return res.status(400).json({ message: `Appeal is already ${appeal.status}.` });
    }

    appeal.status = status;
    if (adminResponse) appeal.adminResponse = adminResponse;

    if (status === "approved") {
      if (requiresRevalidation) {
        // ── Approve WITH re-validation ─────────────────────────────────────────
        // Attendance stays ABSENT until the user re-marks within the given window.
        appeal.requiresRevalidation = true;
        appeal.appealDate = appeal.date;      // re-validation must happen on the appeal's own date
        appeal.appealStartTime = appealStartTime;
        appeal.appealEndTime = appealEndTime;
        appeal.revalidationStatus = "pending";
        await appeal.save();

        await Attendance.updateOne(
          { _id: appeal.attendanceId },
          {
            $set: {
              status: "absent",          // stays absent until user re-marks
              source: "appeal_approval", // signals "awaiting re-validation"
              reason: null,              // clear "auto_absent"
              adminApproved: true,       // lock from auto-absent cron
              penalty: false,
            },
          }
        );

        return res.json({
          message: "Appeal approved with re-validation required.",
          appeal,
          revalidationWindow: { appealDate: appeal.date, appealStartTime, appealEndTime },
        });
      } else {
        // ── Approve WITHOUT re-validation (immediate PRESENT) ──────────────────
        await appeal.save();
        await Attendance.updateOne(
          { _id: appeal.attendanceId },
          {
            $set: {
              status: "present",
              penalty: false,
              source: "appeal_approval",
              reason: null,
              adminApproved: true,
              markedAt: new Date(),
            },
          }
        );

        // NOTE: Approving morning = present naturally requires the user to mark
        // evening — that's enforced by the normal dual-session attendance flow.

        return res.json({ message: "Appeal approved. Attendance marked as present.", appeal });
      }
    } else {
      // ── Rejected ──────────────────────────────────────────────────────────────
      await appeal.save();

      // Mark the appealed session as absent+penalty
      await Attendance.updateOne(
        { _id: appeal.attendanceId },
        {
          $set: {
            status: "absent",
            penalty: true,
            source: "auto_cutoff",
            adminApproved: true,
          },
        }
      );

      // ── Full-day absent rule ───────────────────────────────────────────────────
      // If the rejected appeal is for Work Start (morning), the whole day is lost:
      // also mark Work End (evening) as absent+penalty if not already present.
      if ((appeal.session || "morning") === "morning") {
        const dateParts = getDateTimeParts();
        await Attendance.findOneAndUpdate(
          { userId: appeal.userId, date: appeal.date, session: "evening" },
          {
            $set: {
              userId: appeal.userId,
              date: appeal.date,
              session: "evening",
              status: "absent",
              penalty: true,
              source: "auto_cutoff",
              reason: "morning_appeal_failed",
              autoMarked: true,
              adminApproved: false,
              latitude: null,
              longitude: null,
              distanceFromGeofence: null,
              locationAccuracy: null,
              locationTimestamp: null,
              time: dateParts.time,
              markedAt: dateParts.now,
            },
          },
          { upsert: true, setDefaultsOnInsert: true }
        );
        console.log(`⚖️ [Appeals] Morning appeal rejected for user ${appeal.userId} on ${appeal.date} — evening auto-marked absent.`);
      }

      return res.json({ message: "Appeal rejected.", appeal });
    }
  } catch (err) {
    console.error("Appeal status update error:", err);
    return res.status(500).json({ message: "Failed to process appeal." });
  }
});

module.exports = router;
