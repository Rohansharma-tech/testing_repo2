const express = require("express");
const router = express.Router();
const Appeal = require("../models/Appeal");
const Attendance = require("../models/Attendance");
const { protect, adminOnly } = require("../middleware/auth");
const { getDateTimeParts } = require("../utils/attendance");

router.use(protect);

// ---- POST /api/appeals (User applies for an appeal) ----
router.post("/", async (req, res) => {
  const { date, reason } = req.body;
  if (!date || !reason) {
    return res.status(400).json({ message: "Date and reason are required." });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: "date must be in YYYY-MM-DD format.", code: "INVALID_DATE_FORMAT" });
  }
  try {
    // 1. Verify that Attendance record exists, is absent, and was marked via cutoff.
    const attendance = await Attendance.findOne({ userId: req.user.id, date });
    const isCutoff =
      attendance &&
      (attendance.source === "cutoff" ||
        attendance.source === "auto_cutoff" ||
        attendance.reason === "auto_absent");
    if (!attendance || attendance.status !== "absent" || !isCutoff) {
      return res.status(400).json({ message: "You can only appeal an auto-absent cutoff record." });
    }

    // 2. Prevent duplicate appeals for the same date
    const existing = await Appeal.findOne({ userId: req.user.id, date });
    if (existing) {
      return res.status(409).json({ message: "You have already appealed for this date." });
    }

    const appeal = await Appeal.create({
      userId: req.user.id,
      attendanceId: attendance._id,
      date,
      reason,
      status: "pending",
    });

    return res.status(201).json({ message: "Appeal submitted successfully.", appeal });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "You have already appealed for this date." });
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
    // Remove records whose user has been soft-deleted
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
//   {
//     status: "approved",
//     requiresRevalidation: true,
//     appealDate: "YYYY-MM-DD",   // date the user must mark attendance
//     appealStartTime: "HH:MM",
//     appealEndTime:   "HH:MM",
//     adminResponse: "..."
//   }
//
// Body for rejection:
//   { status: "rejected", adminResponse: "..." }
//
router.put("/:id/status", adminOnly, async (req, res) => {
  const {
    status,
    adminResponse,
    requiresRevalidation,
    appealStartTime,
    appealEndTime,
  } = req.body;

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status." });
  }

  const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

  // Validate re-validation fields when requested
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

    // Guard: do not re-process an already decided appeal
    if (appeal.status !== "pending") {
      return res.status(400).json({ message: `Appeal is already ${appeal.status}.` });
    }

    appeal.status = status;
    if (adminResponse) appeal.adminResponse = adminResponse;

    if (status === "approved") {
      if (requiresRevalidation) {
        // ── Approve WITH re-validation ─────────────────────────────────────────
        // Attendance stays ABSENT; user must self-mark within the appeal window.
        appeal.requiresRevalidation = true;
        // Enforce the re-validation date to match the appeal's strictly original date
        appeal.appealDate = appeal.date;
        appeal.appealStartTime = appealStartTime;
        appeal.appealEndTime = appealEndTime;
        appeal.revalidationStatus = "pending";
        await appeal.save();

        // Update attendance: lock from cron, set source so frontend knows why
        await Attendance.updateOne(
          { _id: appeal.attendanceId },
          {
            $set: {
              status: "absent",              // stays absent until user marks
              source: "appeal_approval",     // signals "awaiting re-validation"
              reason: null,                  // clear "auto_absent"
              adminApproved: true,           // lock from auto-absent cron
              penalty: false,               // no penalty yet
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

        return res.json({ message: "Appeal approved. Attendance marked as present.", appeal });
      }
    } else {
      // ── Rejected ──────────────────────────────────────────────────────────────
      await appeal.save();
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

      return res.json({ message: "Appeal rejected.", appeal });
    }
  } catch (err) {
    console.error("Appeal status update error:", err);
    return res.status(500).json({ message: "Failed to process appeal." });
  }
});

module.exports = router;
