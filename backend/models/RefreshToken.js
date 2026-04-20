// =============================================
// models/RefreshToken.js — Refresh Token Store
// =============================================
// Stores server-side refresh tokens to enable true revocation.
// "family" field implements rotation + theft detection:
//   - Each login starts a new family
//   - Every refresh rotates the token but keeps the same family
//   - If a used/stale token is presented → entire family is revoked (theft signal)
// =============================================

const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Token family — all rotated tokens from the same login session
    family: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    // Optional metadata for audit
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: true }
);

// Auto-delete expired tokens (MongoDB TTL index)
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
