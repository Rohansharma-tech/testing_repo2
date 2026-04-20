// src/utils/fileUrl.js — File URL helpers for GridFS-backed storage
//
// The backend returns:
//   user.profileImageUrl → full absolute URL e.g. https://backend.render.com/api/files/<fileId>
//   leave.supportingDocument.fileId → just the GridFS fileId (hex string)
//
// Use these helpers consistently across the app.

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// Strip trailing /api if present to get the origin
const BACKEND_ORIGIN = API_BASE.endsWith("/api")
  ? API_BASE.slice(0, -4)
  : API_BASE;

/**
 * Build a public URL to serve a file by its GridFS fileId.
 * Used for profile images — no auth required.
 *
 * @param {string|null} fileId — hex ObjectId string
 * @returns {string|null}
 */
export function profileFileUrl(fileId) {
  if (!fileId) return null;
  return `${BACKEND_ORIGIN}/api/files/${fileId}`;
}

/**
 * Build the authenticated URL for a leave supporting document.
 * The browser will automatically send session cookies for this URL
 * when clicking a link or opening in a new tab.
 *
 * @param {string} leaveId — MongoDB _id of the leave request
 * @returns {string}
 */
export function leaveDocUrl(leaveId) {
  return `${BACKEND_ORIGIN}/api/files/leave/${leaveId}`;
}
