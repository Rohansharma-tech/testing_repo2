// =============================================
// routes/appeals.js - Cutoff Appeal Routes
// =============================================

const express = require("express");
const router = express.Router();
const Appeal = require("../models/Appeal");
const Attendance = require("../models/Attendance");
const { protect, adminOnly } = require("../middleware/auth");

router.use(protect);

// ---- POST /api/appeals (User applies for an appeal) ----
router.post("/", async (req, res) => {
  const { date, reason } = req.body;
  if (!date || !reason) {
    return res.status(400).json({ message: "Date and reason are required." });
  }

  try {
    // 1. Verify that Attendance record exists, is absent, and was marked via cutoff.
    const attendance = await Attendance.findOne({ userId: req.user.id, date });
    const isCutoff = attendance && (attendance.source === "cutoff" || attendance.reason === "auto_absent");
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
      .populate("userId", "name email department profileImage")
      .sort({ createdAt: -1 });
    return res.json(appeals);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch appeals." });
  }
});

// ---- PUT /api/appeals/:id/status (Admin approves/rejects appeal) ----
router.put("/:id/status", adminOnly, async (req, res) => {
  const { status, adminResponse } = req.body;

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status." });
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
    await appeal.save();

    if (status === "approved") {
      // ✅ Approved → mark PRESENT, clear reason, set source=appeal, no penalty
      await Attendance.updateOne(
        { _id: appeal.attendanceId },
        {
          $set: {
            status: "present",
            penalty: false,
            source: "appeal",
            reason: null,         // clear "auto_absent" reason — no longer relevant
            adminApproved: true,
            markedAt: new Date(),
          },
        }
      );
    } else {
      // ❌ Rejected → keep ABSENT, keep source=cutoff, apply penalty
      await Attendance.updateOne(
        { _id: appeal.attendanceId },
        {
          $set: {
            status: "absent",
            penalty: true,
            source: "cutoff",     // explicitly keep source as cutoff
            adminApproved: true,  // lock so cron won't overwrite
          },
        }
      );
    }

    return res.json({ message: `Appeal ${status}.`, appeal });
  } catch (err) {
    return res.status(500).json({ message: "Failed to process appeal." });
  }
});

module.exports = router;
