// =============================================
// routes/leaves.js - Leave Request Routes
// =============================================

const express = require("express");
const router = express.Router();
const LeaveRequest = require("../models/LeaveRequest");
const Attendance = require("../models/Attendance");
const { protect, adminOnly } = require("../middleware/auth");
const { getDateTimeParts } = require("../utils/attendance");

router.use(protect);

// ---- POST /api/leaves (User applies for leave) ----
router.post("/", async (req, res) => {
  const { date, reason } = req.body;
  if (!date || !reason) {
    return res.status(400).json({ message: "Date and reason are required." });
  }

  // ── Future-only validation ────────────────────────────────────────────────
  // Leave requests are only allowed for future dates (not today, not past).
  const { date: todayDate } = getDateTimeParts();
  if (date <= todayDate) {
    return res.status(400).json({
      message: "Leave can only be applied for future dates. Same-day and past leave requests are not allowed.",
      code: "LEAVE_DATE_NOT_FUTURE",
    });
  }
  // ── End validation ────────────────────────────────────────────────────────

  try {
    const existingLeave = await LeaveRequest.findOne({ userId: req.user.id, date });
    if (existingLeave) {
      return res.status(409).json({ message: "You have already applied for a leave on this date." });
    }

    const existingAttendance = await Attendance.findOne({ userId: req.user.id, date });
    if (existingAttendance && existingAttendance.status === "present") {
      return res.status(409).json({ message: "You are already marked present for this date." });
    }

    const leave = await LeaveRequest.create({
      userId: req.user.id,
      date,
      reason,
      status: "pending",
    });

    return res.status(201).json({ message: "Leave request submitted successfully.", leave });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "You have already applied for a leave on this date." });
    }
    return res.status(500).json({ message: "Server error while submitting leave request." });
  }
});

// ---- GET /api/leaves/my (User gets their leave requests) ----
router.get("/my", async (req, res) => {
  try {
    const leaves = await LeaveRequest.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json(leaves);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch your leave requests." });
  }
});

// ---- GET /api/leaves/all (Admin gets all leave requests) ----
router.get("/all", adminOnly, async (req, res) => {
  try {
    const leaves = await LeaveRequest.find()
      .populate({
        path: "userId",
        match: { isDeleted: { $ne: true } },
        select: "name email department profileImage",
      })
      .sort({ createdAt: -1 });
    // Remove records whose user has been soft-deleted
    const visible = leaves.filter((l) => l.userId !== null);
    return res.json(visible);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch leave requests." });
  }
});

// ---- PUT /api/leaves/:id/status (Admin approves/rejects leave) ----
router.put("/:id/status", adminOnly, async (req, res) => {
  const { status, adminResponse } = req.body;

  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status." });
  }

  try {
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: "Leave request not found." });

    // Guard: do not re-process an already decided leave
    if (leave.status !== "pending") {
      return res.status(400).json({ message: `Leave is already ${leave.status}.` });
    }

    leave.status = status;
    if (adminResponse) leave.adminResponse = adminResponse;
    await leave.save();

    if (status === "approved") {
      // ✅ Approved → upsert Attendance as LEAVE, no penalty, adminApproved so cron skips
      await Attendance.findOneAndUpdate(
        { userId: leave.userId, date: leave.date },
        {
          $set: {
            userId: leave.userId,
            date: leave.date,
            status: "leave",
            penalty: false,
            source: "leave",
            reason: null,
            adminApproved: true,
            autoMarked: false,
            time: new Date().toTimeString().substring(0, 5),
          },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
    // ❌ Rejected → do NOT touch Attendance at all.
    // The user must come mark attendance manually.
    // If they don't, the auto-absent cron will mark them absent (no penalty).

    return res.json({ message: `Leave request ${status}.`, leave });
  } catch (err) {
    return res.status(500).json({ message: "Failed to process leave request." });
  }
});

module.exports = router;
