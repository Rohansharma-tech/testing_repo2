// =============================================
// utils/fileValidation.js — Magic-number-based file type validation
// =============================================
// Multer's fileFilter only checks the MIME type REPORTED BY THE CLIENT,
// which can be spoofed (e.g. rename malware.php → image.jpg).
// This module reads the actual first bytes (magic numbers) to verify the real type.

const fileType = require("file-type"); // v16 — CommonJS compatible

// ── Allowed MIME sets ─────────────────────────────────────────────────────────

/** Allowed MIME types for profile images */
const PROFILE_ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Allowed MIME types for leave supporting documents.
 * PDF, common images, and Microsoft Word formats.
 */
const LEAVE_DOC_ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",                                                         // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",   // .docx
]);

// ── First-pass: multer fileFilter ─────────────────────────────────────────────
/**
 * Returns a multer-compatible fileFilter function that checks the
 * client-reported MIME type against an allowed set.
 * This is a fast first-pass; magic-byte validation runs second.
 */
function multerMimeFilter(allowedSet) {
  return function fileFilter(_req, file, cb) {
    if (allowedSet.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error("Unsupported file type."), { status: 415 }));
    }
  };
}

// ── Second-pass: magic-byte validation ───────────────────────────────────────
/**
 * Reads the buffer's actual magic bytes and confirms the real file type
 * matches what the client claimed. DOCX/DOC files appear as ZIP to file-type,
 * which is handled specially.
 *
 * @param {Buffer} buf     — file buffer (from multer memoryStorage)
 * @param {string} claimed — MIME type reported by multer/client
 * @param {Set}    allowed — Set of allowed MIME types for this upload kind
 * @returns {Promise<{ok: boolean, detected: string|null}>}
 */
async function validateMagicBytes(buf, claimed, allowed) {
  const result = await fileType.fromBuffer(buf);

  if (!result) {
    // file-type cannot detect — could be a plain-text file (e.g. HTML disguised as PDF)
    // Allow only if the client claimed a Word type (Word XML can look like plain text)
    const isWordClaimed =
      claimed === "application/msword" ||
      claimed === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return { ok: isWordClaimed, detected: null };
  }

  // DOCX = ZIP container, DOC = Compound Binary (x-cfb)
  if (
    (result.mime === "application/zip" || result.mime === "application/x-cfb") &&
    (claimed === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      claimed === "application/msword")
  ) {
    return { ok: true, detected: result.mime };
  }

  return { ok: allowed.has(result.mime), detected: result.mime };
}

module.exports = { PROFILE_ALLOWED, LEAVE_DOC_ALLOWED, multerMimeFilter, validateMagicBytes };
