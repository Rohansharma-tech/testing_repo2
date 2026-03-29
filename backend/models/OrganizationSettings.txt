// =============================================
// models/OrganizationSettings.js — Org-Level Settings Singleton
// =============================================

const mongoose = require("mongoose");

const organizationSettingsSchema = new mongoose.Schema(
  {
    // Singleton key — only one document ever exists
    _singleton: {
      type: String,
      default: "global",
      unique: true,
      immutable: true,
    },

    // Cutoff time in "HH:MM" 24-hour format (e.g. "09:30")
    cutoffTime: {
      type: String,
      default: null,
      validate: {
        validator(value) {
          if (value === null || value === undefined) return true;
          return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
        },
        message: "cutoffTime must be in HH:MM 24-hour format (e.g. '09:30').",
      },
    },

    // IANA timezone string (e.g. "Asia/Kolkata")
    cutoffTimeZone: {
      type: String,
      default: process.env.APP_TIMEZONE || "Asia/Kolkata",
    },

    // Whether the auto-absent job is active
    cutoffEnabled: {
      type: Boolean,
      default: false,
    },

    // Metadata — who last updated this
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Static helper: get-or-create the single settings document
organizationSettingsSchema.statics.getSingleton = async function () {
  let settings = await this.findOne({ _singleton: "global" });
  if (!settings) {
    settings = await this.create({ _singleton: "global" });
  }
  return settings;
};

module.exports = mongoose.model("OrganizationSettings", organizationSettingsSchema);
