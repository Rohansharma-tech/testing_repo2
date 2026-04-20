// =============================================
// routes/leaves.js — Multi-Level Leave Approval (HOD → Principal)
// =============================================

const express = require("express");
const router = express.Router();
const multer = require("multer");

const LeaveRequest = require("../models/LeaveRequest");
const Attendance = require("../models/Attendance");
const { protect, hodOnly, principalOnly, loadFullUser } = require("../middleware/auth");
const { uploadToGridFS, deleteFromGridFS } = require("../utils/gridfs");
const { LEAVE_DOC_ALLOWED, multerMimeFilter, validateMagicBytes } = require("../utils/fileValidation");
const { getDateTimeParts } = require("../utils/attendance");

router.use(protect);

// ── Multer: memory storage ────────────────────────────────────────────────────
// Buffer in memory → magic-byte validate → stream to GridFS.
// Max size: 2 MB.
const leaveDocUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: multerMimeFilter(LEAVE_DOC_ALLOWED),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
}).single("supportingDocument");

function runLeaveDocUpload(req, res) {
  return new Promise((resolve, reject) => {
    leaveDocUpload(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

// ── Shared: mark attendance as leave ─────────────────────────────────────────
async function markAttendanceAsLeave(leave) {
  const leaveFields = {
    status: "leave",
    penalty: false,
    source: "leave",
    reason: leave.type === "half_day" ? "half_day_leave" : "full_day_leave",
    adminApproved: true,
    autoMarked: false,
    time: new Date().toTimeString().substring(0, 5),
  };

  const Attendance = require("../models/Attendance");

  if (leave.type === "half_day") {
    const session = leave.halfDaySession || "morning";
    await Attendance.findOneAndUpdate(
      { userId: leave.userId, date: leave.date, session },
      { $set: { userId: leave.userId, date: leave.date, session, ...leaveFields } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  } else {
    await Promise.all(
      ["morning", "evening"].map((session) =>
        Attendance.findOneAndUpdate(
          { userId: leave.userId, date: leave.date, session },
          { $set: { userId: leave.userId, date: leave.date, session, ...leaveFields } },
          { upsert: true, setDefaultsOnInsert: true }
        )
      )
    );
  }
}

// ── POST /api/leaves — Apply for leave ───────────────────────────────────────
router.post("/", loadFullUser, async (req, res) => {
  // Step 1: parse multipart
  try { await runLeaveDocUpload(req, res); }
  catch (err) { return res.status(400).json({ message: err.message }); }

  const { date, reason, type = "full_day", halfDaySession = null } = req.body;
  if (!date || !reason)
    return res.status(400).json({ message: "Date and reason are required." });
  if (!["full_day", "half_day"].includes(type))
    return res.status(400).json({ message: "type must be 'full_day' or 'half_day'." });
  if (type === "half_day" && !["morning", "evening"].includes(halfDaySession))
    return res.status(400).json({ message: "halfDaySession must be 'morning' or 'evening'." });

  const { date: todayDate } = getDateTimeParts();
  if (date <= todayDate)
    return res.status(400).json({ message: "Leave can only be applied for future dates.", code: "LEAVE_DATE_NOT_FUTURE" });

  // Step 2: magic-byte validation
  if (req.file) {
    const { ok, detected } = await validateMagicBytes(req.file.buffer, req.file.mimetype, LEAVE_DOC_ALLOWED);
    if (!ok)
      return res.status(415).json({ message: `File content does not match a supported type (detected: ${detected ?? "unknown"}).` });
  }

  try {
    const existingLeave = await LeaveRequest.findOne({ userId: req.user.id, date });
    if (existingLeave)
      return res.status(409).json({ message: "You have already applied for a leave on this date." });

    const existingAttendance = await Attendance.findOne({ userId: req.user.id, date });
    if (existingAttendance?.status === "present")
      return res.status(409).json({ message: "You are already marked present for this date." });

    const initialStatus = req.fullUser.role === "hod" ? "pending_principal" : "pending_hod";

    // Step 3: Upload document to GridFS
    let supportingDocument = {};
    if (req.file) {
      const fileId = await uploadToGridFS(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        { purpose: "leave_document", userId: String(req.user.id) }
      );
      supportingDocument = {
        originalName: req.file.originalname,
        fileId:       String(fileId),
        mimeType:     req.file.mimetype,
        size:         req.file.size,
      };
    }

    const leave = await LeaveRequest.create({
      userId:      req.user.id,
      department:  req.fullUser.department || null,
      date,
      reason,
      type,
      halfDaySession: type === "half_day" ? halfDaySession : null,
      status:      initialStatus,
      ...(req.file ? { supportingDocument } : {}),
    });

    return res.status(201).json({ message: "Leave request submitted successfully.", leave });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ message: "You have already applied for a leave on this date." });
    return res.status(500).json({ message: "Server error while submitting leave request." });
  }
});

// ── GET /api/leaves/my ────────────────────────────────────────────────────────
router.get("/my", async (req, res) => {
  try {
    const leaves = await LeaveRequest.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json(leaves);
  } catch {
    return res.status(500).json({ message: "Failed to fetch your leave requests." });
  }
});

// ── GET /api/leaves/hod ───────────────────────────────────────────────────────
// Returns ALL leaves from the HOD's department (all statuses) so the
// frontend can filter by tab (Pending / Forwarded / Rejected / Fully Approved).
router.get("/hod", hodOnly, loadFullUser, async (req, res) => {
  try {
    const dept = req.fullUser.department;
    if (!dept)
      return res.status(400).json({ message: "Your account has no department assigned." });
    const leaves = await LeaveRequest.find({
      department: dept,
      userId: { $ne: req.user.id },  // exclude HOD's own leave requests
    })
      .populate({ path: "userId", select: "name email firstName lastName department profileImage", match: { isDeleted: { $ne: true } } })
      .sort({ createdAt: -1 });
    return res.json(leaves.filter((l) => l.userId !== null));
  } catch (err) {
    console.error("HOD fetch error:", err);
    return res.status(500).json({ message: "Failed to fetch leave requests." });
  }
});

// ── GET /api/leaves/principal ─────────────────────────────────────────────────
router.get("/principal", principalOnly, async (req, res) => {
  try {
    const leaves = await LeaveRequest.find({
      status: { $in: ["pending_principal", "approved_hod", "approved", "rejected"] },
    })
      .populate({ path: "userId", select: "name email firstName lastName department profileImage role", match: { isDeleted: { $ne: true } } })
      .sort({ createdAt: -1 });
    return res.json(leaves.filter((l) => l.userId !== null));
  } catch {
    return res.status(500).json({ message: "Failed to fetch leave requests." });
  }
});

// ── PUT /api/leaves/:id/hod-action ───────────────────────────────────────────
router.put("/:id/hod-action", hodOnly, loadFullUser, async (req, res) => {
  const { action, remarks } = req.body;
  if (!["approved", "rejected"].includes(action))
    return res.status(400).json({ message: "action must be 'approved' or 'rejected'." });

  try {
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: "Leave request not found." });
    if (leave.status !== "pending_hod")
      return res.status(400).json({ message: `This leave has already been actioned (status: ${leave.status}).` });
    if (leave.userId.toString() === req.user.id)
      return res.status(403).json({ message: "You cannot approve your own leave request." });
    const hodDept = req.fullUser.department;
    if (!hodDept || leave.department !== hodDept)
      return res.status(403).json({ message: "Not authorised to act on leaves from a different department." });

    leave.hodApproval = { approvedBy: req.user.id, action, remarks: remarks || "", at: new Date() };
    leave.status = action === "approved" ? "approved_hod" : "rejected_hod";
    await leave.save();

    return res.json({
      message: action === "approved" ? "Leave approved by HOD. Forwarded to Principal." : "Leave rejected by HOD.",
      leave,
    });
  } catch (err) {
    console.error("HOD action error:", err);
    return res.status(500).json({ message: "Failed to process leave request." });
  }
});

// ── PUT /api/leaves/:id/principal-action ─────────────────────────────────────
router.put("/:id/principal-action", principalOnly, async (req, res) => {
  const { action, remarks } = req.body;
  if (!["approved", "rejected"].includes(action))
    return res.status(400).json({ message: "action must be 'approved' or 'rejected'." });

  try {
    const leave = await LeaveRequest.findById(req.params.id);
    if (!leave) return res.status(404).json({ message: "Leave request not found." });
    if (!["approved_hod", "pending_principal"].includes(leave.status))
      return res.status(400).json({
        message: leave.status === "pending_hod"
          ? "This leave has not yet been reviewed by the HOD."
          : `This leave has already been finalised (status: ${leave.status}).`,
      });

    leave.principalApproval = { approvedBy: req.user.id, action, remarks: remarks || "", at: new Date() };

    if (action === "approved") {
      leave.status = "approved";
      await leave.save();
      await markAttendanceAsLeave(leave);
      return res.json({ message: "Leave fully approved. Attendance has been marked.", leave });
    } else {
      leave.status = "rejected";
      await leave.save();
      return res.json({ message: "Leave rejected by Principal.", leave });
    }
  } catch (err) {
    console.error("Principal action error:", err);
    return res.status(500).json({ message: "Failed to process leave request." });
  }
});

module.exports = router;
