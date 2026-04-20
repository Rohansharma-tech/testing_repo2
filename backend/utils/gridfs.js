// =============================================
// utils/gridfs.js — MongoDB GridFS Helpers
// =============================================
// Files are stored directly in MongoDB Atlas via GridFS.
// This avoids any dependency on local filesystem or external storage services.
// GridFS splits files into 255 KB chunks stored in:
//   uploads.files   — metadata (filename, contentType, size, uploadDate, metadata)
//   uploads.chunks  — binary data chunks

const mongoose = require("mongoose");
const { GridFSBucket, ObjectId } = require("mongodb");

// ── Bucket singleton ──────────────────────────────────────────────────────────
// Created lazily after Mongoose connects to MongoDB.
let _bucket = null;

function getBucket() {
  if (_bucket) return _bucket;
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB not connected. Call getBucket() only after mongoose.connect().");
  }
  _bucket = new GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });
  return _bucket;
}

// ── Upload ────────────────────────────────────────────────────────────────────
/**
 * Upload a Buffer to GridFS.
 *
 * @param {Buffer} buffer       — file content
 * @param {string} filename     — original filename (for metadata)
 * @param {string} contentType  — MIME type
 * @param {object} metadata     — arbitrary metadata (e.g. { purpose: "profile" })
 * @returns {Promise<ObjectId>} the GridFS file _id
 */
function uploadToGridFS(buffer, filename, contentType, metadata = {}) {
  const bucket = getBucket();
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      contentType,
      metadata,
    });
    uploadStream.end(buffer);
    uploadStream.on("finish", () => resolve(uploadStream.id));
    uploadStream.on("error", reject);
  });
}

// ── Delete ────────────────────────────────────────────────────────────────────
/**
 * Delete a file from GridFS by its _id.
 * Silently swallows errors so callers don't fail on cleanup.
 *
 * @param {string|ObjectId} fileId
 */
async function deleteFromGridFS(fileId) {
  if (!fileId) return;
  try {
    const bucket = getBucket();
    const id = fileId instanceof ObjectId ? fileId : new ObjectId(String(fileId));
    await bucket.delete(id);
  } catch {
    // Non-fatal — log in production if needed
  }
}

// ── Stream ────────────────────────────────────────────────────────────────────
/**
 * Open a download stream for a file stored in GridFS.
 * Caller is responsible for piping this stream to the HTTP response.
 *
 * @param {string|ObjectId} fileId
 * @returns {GridFSBucketReadStream}
 */
function openDownloadStream(fileId) {
  const bucket = getBucket();
  const id = fileId instanceof ObjectId ? fileId : new ObjectId(String(fileId));
  return bucket.openDownloadStream(id);
}

// ── Find metadata ─────────────────────────────────────────────────────────────
/**
 * Retrieve the GridFS file metadata document (not the binary content).
 * Useful to get contentType and size before streaming.
 *
 * @param {string|ObjectId} fileId
 * @returns {Promise<object|null>}
 */
async function getFileMeta(fileId) {
  const bucket = getBucket();
  const id = fileId instanceof ObjectId ? fileId : new ObjectId(String(fileId));
  const cursor = bucket.find({ _id: id });
  const files = await cursor.toArray();
  return files[0] ?? null;
}

module.exports = { getBucket, uploadToGridFS, deleteFromGridFS, openDownloadStream, getFileMeta };
