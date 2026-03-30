// =============================================
// services/autoCutoffScheduler.js — Auto-Absent Cron Job
// =============================================

const cron = require("node-cron");
const OrganizationSettings = require("../models/OrganizationSettings");
const Attendance = require("../models/Attendance");
const User = require("../models/User");
const { getDateTimeParts } = require("../utils/attendance");

// ---- Internal state ----
let _currentTask = null; // active cron.ScheduledTask instance
let _scheduledCutoff = null; // "HH:MM" string currently scheduled

// ---- Helpers ----

/**
 * Converts "HH:MM" + IANA timezone into a cron expression.
 * node-cron does NOT support timezone offsets natively in the spec string,
 * but it does accept a { timezone } option — we use that.
 */
function buildCronExpression(cutoffTime) {
  const [hour, minute] = cutoffTime.split(":");
  // Fire once per day at HH:MM
  return `${Number(minute)} ${Number(hour)} * * *`;
}

/**
 * Core job: find all users with incomplete attendance today, mark them ABSENT.
 */
async function runAutoAbsentJob() {
  const dateParts = getDateTimeParts();
  const today = dateParts.date;

  console.log(`⏰ [AutoAbsent] Running for date: ${today}`);

  try {
    // 1. All non-admin users
    const users = await User.find({ role: "user" }).select("_id").lean();
    if (!users.length) {
      console.log("⏰ [AutoAbsent] No users to process.");
      return;
    }

    const userIds = users.map((u) => u._id);

    // 2. Existing records for today
    const existingRecords = await Attendance.find(
      { date: today, userId: { $in: userIds } },
      { userId: 1, status: 1, adminApproved: 1 }
    ).lean();

    // Build a lookup: userId string → record
    const recordMap = new Map(
      existingRecords.map((r) => [String(r.userId), r])
    );

    // 3. Identify users who need auto-absent
    const toMark = [];
    for (const user of users) {
      const uid = String(user._id);
      const record = recordMap.get(uid);

      // Skip: already PRESENT
      if (record?.status === "present") continue;
      // Skip: manually approved by admin
      if (record?.adminApproved === true) continue;

      toMark.push(user._id);
    }

    if (!toMark.length) {
      console.log("⏰ [AutoAbsent] All users already have complete records — nothing to do.");
      return;
    }

    console.log(`⏰ [AutoAbsent] Marking ${toMark.length} user(s) as auto-absent.`);

    // 4. Bulk upsert — idempotent
    const bulkOps = toMark.map((userId) => ({
      updateOne: {
        filter: { userId, date: today },
        update: {
          $set: {
            userId,
            date: today,
            time: dateParts.time,
            status: "absent",
            reason: "auto_absent",
            autoMarked: true,
            source: "cutoff",
            markedAt: dateParts.now,
            // Location fields intentionally null for auto-absent
            latitude: null,
            longitude: null,
            distanceFromGeofence: null,
            locationAccuracy: null,
            locationTimestamp: null,
          },
          $setOnInsert: {
            adminApproved: false,
          },
        },
        upsert: true,
      },
    }));

    const result = await Attendance.bulkWrite(bulkOps, { ordered: false });
    console.log(
      `⏰ [AutoAbsent] Done. Inserted: ${result.upsertedCount}, Updated: ${result.modifiedCount}`
    );
  } catch (err) {
    console.error("⏰ [AutoAbsent] Error during auto-absent job:", err.message);
  }
}

// ---- Public API ----

/**
 * Schedule (or re-schedule) the cutoff job.
 * Safe to call multiple times — cancels the previous job first.
 *
 * @param {string} cutoffTime  "HH:MM" in 24-hour format
 * @param {string} timeZone    IANA timezone string
 */
function scheduleCutoffJob(cutoffTime, timeZone) {
  // Cancel any existing job
  cancelCutoffJob();

  const expression = buildCronExpression(cutoffTime);

  try {
    _currentTask = cron.schedule(expression, runAutoAbsentJob, {
      timezone: timeZone,
      scheduled: true,
    });
    _scheduledCutoff = cutoffTime;
    console.log(
      `⏰ [AutoAbsent] Scheduled at ${cutoffTime} (${timeZone}) — cron: "${expression}"`
    );
  } catch (err) {
    console.error("⏰ [AutoAbsent] Failed to schedule job:", err.message);
    _currentTask = null;
    _scheduledCutoff = null;
  }
}

/**
 * Cancel the currently active cutoff job (if any).
 */
function cancelCutoffJob() {
  if (_currentTask) {
    _currentTask.destroy();
    _currentTask = null;
    _scheduledCutoff = null;
    console.log("⏰ [AutoAbsent] Cancelled existing job.");
  }
}

/**
 * Read OrganizationSettings from DB and boot the scheduler if enabled.
 * Call this once after MongoDB connects.
 */
async function initCutoffScheduler() {
  try {
    const settings = await OrganizationSettings.getSingleton();
    if (settings.cutoffEnabled && settings.cutoffTime) {
      scheduleCutoffJob(settings.cutoffTime, settings.cutoffTimeZone);
    } else {
      console.log("⏰ [AutoAbsent] Cutoff job is disabled — skipping scheduler init.");
    }
  } catch (err) {
    console.error("⏰ [AutoAbsent] Failed to init scheduler:", err.message);
  }
}

/**
 * Returns the currently scheduled cutoff or null.
 */
function getScheduledCutoff() {
  return _scheduledCutoff;
}

module.exports = {
  initCutoffScheduler,
  scheduleCutoffJob,
  cancelCutoffJob,
  getScheduledCutoff,
  runAutoAbsentJob, // exported for manual trigger / testing
};
