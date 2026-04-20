// =============================================
// routes/files.js — GridFS File Serving
// =============================================
// Two endpoints:
//
//   GET /api/files/:fileId
//     → Public. Streams any file from GridFS.
//       Profile images are served here. File IDs are MongoDB ObjectIds
//       (24-char hex), unguessable by design.
//
//   GET /api/files/leave/:leaveId
//     → Authenticated. Validates JWT then checks the caller is:
//         • the employee who submitted the leave
//         • the HOD of the same department
//         • the Principal
//         • an Admin
//       Streams the leave's supporting document from GridFS.

const express = require("express");
const router = express.Router();
const { ObjectId } = require("mongodb");

const { protect, loadFullUser } = require("../middleware/auth");
const { openDownloadStream, getFileMeta } = require("../utils/gridfs");
const LeaveRequest = require("../models/LeaveRequest");

// ── Helper ────────────────────────────────────────────────────────────────────

function isValidObjectId(str) {
  return /^[a-f\d]{24}$/i.test(str);
}

/** Stream a GridFS file to the HTTP response with correct Content-Type. */
async function streamFile(fileId, res) {
  const meta = await getFileMeta(fileId);
  if (!meta) {
    return res.status(404).json({ message: "File not found." });
  }

  // Set response headers
  res.set("Content-Type", meta.contentType || "application/octet-stream");
  res.set("Content-Length", meta.length);
  // Cache profile images aggressively; don't cache leave docs
  res.set("Cache-Control", "public, max-age=86400"); // 1 day

  const downloadStream = openDownloadStream(fileId);
  downloadStream.on("error", () => {
    if (!res.headersSent) res.status(404).json({ message: "File not found." });
  });
  downloadStream.pipe(res);
}

// ── GET /api/files/:fileId — Public file serving ──────────────────────────────
// Used primarily for profile images displayed in <img> tags across all pages.
// No authentication required — the 24-character ObjectId is unguessable.
router.get("/:fileId", async (req, res) => {
  const { fileId } = req.params;
  if (!isValidObjectId(fileId)) {
    return res.status(400).json({ message: "Invalid file ID." });
  }
  try {
    await streamFile(new ObjectId(fileId), res);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ message: "Failed to retrieve file." });
  }
});

// ── GET /api/files/leave/:leaveId — Authenticated leave document ──────────────
// Must be mounted BEFORE the /:fileId route (more specific path first).
// Authenticates the user then checks they are authorised to view the document.
router.get("/leave/:leaveId", protect, loadFullUser, async (req, res) => {
  try {
    const leave = await LeaveRequest.findById(req.params.leaveId);
    if (!leave) return res.status(404).json({ message: "Leave not found." });

    const doc = leave.supportingDocument;
    if (!doc?.fileId) return res.status(404).json({ message: "No supporting document attached." });

    // ── Authorization ──────────────────────────────────────────────────────────
    const { role, id: requesterId, department } = req.fullUser;
    const isOwner     = leave.userId.toString() === requesterId;
    const isAdmin     = role === "admin";
    const isPrincipal = role === "principal";
    const isHod       = role === "hod" && leave.department === department;

    if (!isOwner && !isAdmin && !isPrincipal && !isHod) {
      return res.status(403).json({ message: "Not authorised to access this document." });
    }

    // Override cache header for private documents
    res.set("Cache-Control", "no-store");

    await streamFile(new ObjectId(String(doc.fileId)), res);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ message: "Failed to retrieve document." });
  }
});

module.exports = router;
