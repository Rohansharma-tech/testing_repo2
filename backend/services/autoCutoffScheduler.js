// =============================================
// services/autoCutoffScheduler.js — Auto-Absent + Appeal Deadline Cron Jobs
// =============================================

const cron = require("node-cron");
const OrganizationSettings = require("../models/OrganizationSettings");
const Attendance = require("../models/Attendance");
const Appeal = require("../models/Appeal");
const User = require("../models/User");
const { getDateTimeParts } = require("../utils/attendance");

// ──────────────────────────────────────────────────────────────────────────────
// Internal state
// ──────────────────────────────────────────────────────────────────────────────
let _currentTask = null;         // active cron.ScheduledTask for auto-absent
let _scheduledCutoff = null;     // "HH:MM" string currently scheduled
let _appealDeadlineTask = null;  // active cron.ScheduledTask for appeal deadlines

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Converts "HH:MM" + IANA timezone into a cron expression.
 * node-cron does NOT support timezone offsets natively in the spec string,
 * but it does accept a { timezone } option — we use that.
 */
function buildCronExpression(cutoffTime) {
  const [hour, minute] = cutoffTime.split(":");
  return `${Number(minute)} ${Number(hour)} * * *`;
}

/**
 * Returns the current "HH:MM" time string in the given IANA timezone.
 */
function getCurrentTimeHHMM(timeZone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Job 1: Auto-Absent (fires once daily at attendanceEndTime / cutoffTime)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Core job: find all users with incomplete attendance today, mark them ABSENT.
 */
async function runAutoAbsentJob() {
  const dateParts = getDateTimeParts();
  const today = dateParts.date;

  console.log(`⏰ [AutoAbsent] Running for date: ${today}`);

  try {
    const users = await User.find({ role: "user", isDeleted: { $ne: true } }).select("_id").lean();
    if (!users.length) {
      console.log("⏰ [AutoAbsent] No users to process.");
      return;
    }

    const userIds = users.map((u) => u._id);

    const existingRecords = await Attendance.find(
      { date: today, userId: { $in: userIds } },
      { userId: 1, status: 1, adminApproved: 1 }
    ).lean();

    const recordMap = new Map(
      existingRecords.map((r) => [String(r.userId), r])
    );

    const toMark = [];
    for (const user of users) {
      const uid = String(user._id);
      const record = recordMap.get(uid);

      if (record?.status === "present") continue;
      if (record?.adminApproved === true) continue;   // appeal-locked records are skipped

      toMark.push(user._id);
    }

    if (!toMark.length) {
      console.log("⏰ [AutoAbsent] All users already have complete records — nothing to do.");
      return;
    }

    console.log(`⏰ [AutoAbsent] Marking ${toMark.length} user(s) as auto-absent.`);

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
            source: "auto_cutoff",
            markedAt: dateParts.now,
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

// ──────────────────────────────────────────────────────────────────────────────
// Job 2: Appeal Deadline Enforcement (runs every minute)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Every minute: find approved appeals with re-validation pending whose
 * appealEndTime has passed for appealDate (today). Mark their attendance
 * ABSENT + penalty and set revalidationStatus = "missed".
 */
async function runAppealDeadlineJob() {
  try {
    const settings = await OrganizationSettings.getSingleton();
    const timeZone = settings.cutoffTimeZone || process.env.APP_TIMEZONE || "Asia/Kolkata";
    const dateParts = getDateTimeParts(new Date(), timeZone);
    const today = dateParts.date;
    const currentHHMM = getCurrentTimeHHMM(timeZone);

    // Find all pending re-validation appeals for today whose window has passed
    const overdueAppeals = await Appeal.find({
      status: "approved",
      requiresRevalidation: true,
      revalidationStatus: "pending",
      appealDate: today,
      appealEndTime: { $lte: currentHHMM },
    }).lean();

    if (!overdueAppeals.length) return;

    console.log(`⏰ [AppealDeadline] Processing ${overdueAppeals.length} overdue re-validation(s).`);

    const appealIds = overdueAppeals.map((a) => a._id);
    const attendanceIds = overdueAppeals.map((a) => a.attendanceId);

    // Mark re-validation as missed
    await Appeal.updateMany(
      { _id: { $in: appealIds } },
      { $set: { revalidationStatus: "missed" } }
    );

    // Apply penalty to attendance
    await Attendance.updateMany(
      { _id: { $in: attendanceIds } },
      {
        $set: {
          status: "absent",
          penalty: true,
          source: "auto_cutoff",
          reason: "auto_absent",
          autoMarked: true,
        },
      }
    );

    console.log(`⏰ [AppealDeadline] Marked ${overdueAppeals.length} missed re-validation(s) as absent+penalty.`);
  } catch (err) {
    console.error("⏰ [AppealDeadline] Error:", err.message);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Schedule (or re-schedule) the cutoff job.
 * Safe to call multiple times — cancels the previous job first.
 */
function scheduleCutoffJob(cutoffTime, timeZone) {
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
 * Start the appeal deadline cron (runs every minute).
 * Safe to call multiple times — stops the old task first.
 */
function startAppealDeadlineCron() {
  if (_appealDeadlineTask) {
    _appealDeadlineTask.destroy();
    _appealDeadlineTask = null;
  }

  _appealDeadlineTask = cron.schedule("* * * * *", runAppealDeadlineJob, {
    scheduled: true,
  });
  console.log("⏰ [AppealDeadline] Per-minute deadline cron started.");
}

/**
 * Read OrganizationSettings from DB and boot both schedulers.
 * Call this once after MongoDB connects.
 */
async function initCutoffScheduler() {
  try {
    const settings = await OrganizationSettings.getSingleton();

    // Prefer the new attendanceEndTime; fall back to legacy cutoffTime
    const effectiveCutoff = settings.attendanceEndTime || settings.cutoffTime;

    if (settings.cutoffEnabled && effectiveCutoff) {
      scheduleCutoffJob(effectiveCutoff, settings.cutoffTimeZone);
    } else {
      console.log("⏰ [AutoAbsent] Cutoff job is disabled — skipping scheduler init.");
    }

    // Always start the appeal deadline cron regardless of cutoff config
    startAppealDeadlineCron();
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
  runAutoAbsentJob,         // exported for manual trigger / testing
  runAppealDeadlineJob,     // exported for manual trigger / testing
};
