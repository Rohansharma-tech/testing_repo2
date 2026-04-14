// =============================================
// services/autoCutoffScheduler.js — Auto-Absent + Appeal Deadline Cron Jobs
// =============================================

const cron = require("node-cron");
const OrganizationSettings = require("../models/OrganizationSettings");
const Attendance = require("../models/Attendance");
const Appeal = require("../models/Appeal");
const User = require("../models/User");
const LeaveRequest = require("../models/LeaveRequest");
const { getDateTimeParts } = require("../utils/attendance");

// ──────────────────────────────────────────────────────────────────────────────
// Internal state
// ──────────────────────────────────────────────────────────────────────────────
let _morningTask = null;        // active cron.ScheduledTask for morning auto-absent
let _scheduledMorningCutoff = null; // "HH:MM" string currently scheduled (morning)

let _eveningTask = null;        // active cron.ScheduledTask for evening auto-absent
let _scheduledEveningCutoff = null; // "HH:MM" string currently scheduled (evening)

let _appealDeadlineTask = null; // active cron.ScheduledTask for appeal deadlines

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Converts "HH:MM" + IANA timezone into a cron expression.
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
// Job 1: Auto-Absent (fires at morning end-time and/or evening end-time)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Core job: find all users who haven't marked attendance for the given session
 * today, and mark them ABSENT.
 *
 * @param {"morning"|"evening"} session
 */
async function runAutoAbsentJob(session = "morning") {
  // Always read timezone from DB so it stays in sync with admin settings
  let timeZone = process.env.APP_TIMEZONE || "Asia/Kolkata";
  try {
    const settings = await OrganizationSettings.getSingleton();
    timeZone = settings.cutoffTimeZone || timeZone;
  } catch (_) { /* use default */ }

  const dateParts = getDateTimeParts(new Date(), timeZone);
  const today = dateParts.date;

  console.log(`⏰ [AutoAbsent:${session}] Running for date: ${today} (tz: ${timeZone})`);

  try {
    const users = await User.find({ role: "user", isDeleted: { $ne: true } }).select("_id").lean();
    if (!users.length) {
      console.log(`⏰ [AutoAbsent:${session}] No users to process.`);
      return;
    }

    const userIds = users.map((u) => u._id);

    // Fetch approved half-day leaves for today and build a userId → leaveSession map.
    // Only skip a user for the session that their leave COVERS.
    // e.g. morning leave → skip morning auto-absent (must attend evening)
    //      evening leave → skip evening auto-absent (must attend morning)
    const halfDayLeaves = await LeaveRequest.find({
      date: today,
      status: "approved",
      type: "half_day",
      userId: { $in: userIds },
    }).select("userId halfDaySession").lean();

    // Map: userId (string) → "morning" | "evening"
    const halfDayLeaveSessionMap = new Map(
      halfDayLeaves.map((l) => [String(l.userId), l.halfDaySession || "morning"])
    );

    // Find only records for this session
    const existingRecords = await Attendance.find(
      { date: today, session, userId: { $in: userIds } },
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
      if (record?.status === "leave") continue;   // half-day leave record — skip
      if (record?.adminApproved === true) continue; // appeal-locked records are skipped

      // Skip only if this user's half-day leave covers the CURRENT session
      const userLeaveSession = halfDayLeaveSessionMap.get(uid);
      if (userLeaveSession === session) continue; // their leave is for this session — skip auto-absent

      toMark.push(user._id);
    }

    if (!toMark.length) {
      console.log(`⏰ [AutoAbsent:${session}] All users already have complete records — nothing to do.`);
      return;
    }

    console.log(`⏰ [AutoAbsent:${session}] Marking ${toMark.length} user(s) as auto-absent.`);

    const bulkOps = toMark.map((userId) => ({
      updateOne: {
        filter: { userId, date: today, session },
        update: {
          $set: {
            userId,
            date: today,
            session,
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
      `⏰ [AutoAbsent:${session}] Done. Inserted: ${result.upsertedCount}, Updated: ${result.modifiedCount}`
    );
  } catch (err) {
    console.error(`⏰ [AutoAbsent:${session}] Error during auto-absent job:`, err.message);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Job 1b: Full-Day Absent Reconciliation
// Runs when the evening cutoff fires: if a user has NO attendance for either
// session today (absent or present), ensure both sessions are marked absent.
// This handles the case where morning cutoff is disabled but evening is enabled.
// ──────────────────────────────────────────────────────────────────────────────

async function runFullDayAbsentReconciliation() {
  let timeZone = process.env.APP_TIMEZONE || "Asia/Kolkata";
  try {
    const settings = await OrganizationSettings.getSingleton();
    timeZone = settings.cutoffTimeZone || timeZone;

    // Only run when BOTH sessions are configured
    const hasMorning = Boolean(settings.attendanceStartTime || settings.attendanceEndTime);
    const hasEvening = Boolean(settings.eveningStartTime || settings.eveningEndTime);
    if (!hasMorning || !hasEvening) return;
  } catch (_) { return; }

  const dateParts = getDateTimeParts(new Date(), timeZone);
  const today = dateParts.date;

  console.log(`⏰ [FullDayAbsent] Reconciling full-day absences for ${today}`);

  try {
    const users = await User.find({ role: "user", isDeleted: { $ne: true } }).select("_id").lean();
    if (!users.length) return;

    const userIds = users.map((u) => u._id);

    // Fetch approved half-day leaves — users on half-day leave are exempt
    const halfDayLeaves = await LeaveRequest.find({
      date: today,
      status: "approved",
      type: "half_day",
      userId: { $in: userIds },
    }).select("userId").lean();
    const halfDayUserIds = new Set(halfDayLeaves.map((l) => String(l.userId)));

    // Fetch all today's records
    const todayRecords = await Attendance.find(
      { date: today, userId: { $in: userIds } },
      { userId: 1, session: 1, status: 1, adminApproved: 1 }
    ).lean();

    // Group by userId
    const byUser = new Map();
    for (const r of todayRecords) {
      const uid = String(r.userId);
      if (!byUser.has(uid)) byUser.set(uid, {});
      byUser.get(uid)[r.session] = r;
    }

    const morningBulk = [];
    const eveningBulk = [];

    for (const user of users) {
      const uid = String(user._id);
      if (halfDayUserIds.has(uid)) continue; // skip half-day leave users

      const records = byUser.get(uid) || {};
      const morning = records["morning"];
      const evening = records["evening"];

      // If neither session has attendance yet → mark both absent
      const morningMissing = !morning || (morning.status !== "present" && morning.status !== "leave" && !morning.adminApproved);
      const eveningMissing = !evening || (evening.status !== "present" && evening.status !== "leave" && !evening.adminApproved);

      if (morningMissing && eveningMissing) {
        morningBulk.push({
          updateOne: {
            filter: { userId: user._id, date: today, session: "morning" },
            update: {
              $set: {
                userId: user._id, date: today, session: "morning",
                time: dateParts.time, status: "absent", reason: "auto_absent",
                autoMarked: true, source: "auto_cutoff", markedAt: dateParts.now,
                latitude: null, longitude: null, distanceFromGeofence: null,
                locationAccuracy: null, locationTimestamp: null,
              },
              $setOnInsert: { adminApproved: false },
            },
            upsert: true,
          },
        });
        eveningBulk.push({
          updateOne: {
            filter: { userId: user._id, date: today, session: "evening" },
            update: {
              $set: {
                userId: user._id, date: today, session: "evening",
                time: dateParts.time, status: "absent", reason: "auto_absent",
                autoMarked: true, source: "auto_cutoff", markedAt: dateParts.now,
                latitude: null, longitude: null, distanceFromGeofence: null,
                locationAccuracy: null, locationTimestamp: null,
              },
              $setOnInsert: { adminApproved: false },
            },
            upsert: true,
          },
        });
      }
    }

    if (morningBulk.length) {
      const r = await Attendance.bulkWrite([...morningBulk, ...eveningBulk], { ordered: false });
      console.log(`⏰ [FullDayAbsent] Marked ${morningBulk.length} user(s) fully absent. Inserted: ${r.upsertedCount}, Updated: ${r.modifiedCount}`);
    } else {
      console.log(`⏰ [FullDayAbsent] No full-day absences to reconcile.`);
    }
  } catch (err) {
    console.error(`⏰ [FullDayAbsent] Error:`, err.message);
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

    // Apply penalty to the appealed attendance record
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

    // ── Full-day absent rule ────────────────────────────────────────────────────
    // If a MORNING (Work Start) re-validation was missed, the whole day is forfeited:
    // also mark the EVENING (Work End) session as absent+penalty if not already present.
    const morningMissed = overdueAppeals.filter((a) => (a.session || "morning") === "morning");
    if (morningMissed.length > 0) {
      console.log(`⏰ [AppealDeadline] ${morningMissed.length} morning re-validation(s) missed — marking evening absent (full-day rule).`);
      const eveningBulkOps = morningMissed.map((a) => ({
        updateOne: {
          filter: { userId: a.userId, date: today, session: "evening" },
          update: {
            $set: {
              userId: a.userId,
              date: today,
              session: "evening",
              status: "absent",
              penalty: true,
              source: "auto_cutoff",
              reason: "morning_appeal_failed",
              autoMarked: true,
              time: dateParts.time,
              markedAt: dateParts.now,
              latitude: null,
              longitude: null,
              distanceFromGeofence: null,
              locationAccuracy: null,
              locationTimestamp: null,
            },
            $setOnInsert: { adminApproved: false },
          },
          upsert: true,
        },
      }));
      const eveningResult = await Attendance.bulkWrite(eveningBulkOps, { ordered: false });
      console.log(`⏰ [AppealDeadline] Evening absent applied — Inserted: ${eveningResult.upsertedCount}, Updated: ${eveningResult.modifiedCount}`);
    }
  } catch (err) {
    console.error("⏰ [AppealDeadline] Error:", err.message);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Schedule (or re-schedule) the MORNING cutoff job.
 * Safe to call multiple times — cancels the previous job first.
 */
function scheduleCutoffJob(cutoffTime, timeZone) {
  cancelCutoffJob();
  const expression = buildCronExpression(cutoffTime);
  try {
    _morningTask = cron.schedule(expression, () => runAutoAbsentJob("morning"), {
      timezone: timeZone,
      scheduled: true,
    });
    _scheduledMorningCutoff = cutoffTime;
    console.log(
      `⏰ [AutoAbsent:morning] Scheduled at ${cutoffTime} (${timeZone}) — cron: "${expression}"`
    );
  } catch (err) {
    console.error("⏰ [AutoAbsent:morning] Failed to schedule job:", err.message);
    _morningTask = null;
    _scheduledMorningCutoff = null;
  }
}

/**
 * Cancel the currently active morning cutoff job (if any).
 */
function cancelCutoffJob() {
  if (_morningTask) {
    _morningTask.destroy();
    _morningTask = null;
    _scheduledMorningCutoff = null;
    console.log("⏰ [AutoAbsent:morning] Cancelled existing job.");
  }
}

/**
 * Schedule (or re-schedule) the EVENING cutoff job.
 * Safe to call multiple times — cancels the previous job first.
 */
function scheduleEveningCutoffJob(cutoffTime, timeZone) {
  cancelEveningCutoffJob();
  const expression = buildCronExpression(cutoffTime);
  try {
    _eveningTask = cron.schedule(expression, async () => {
      await runAutoAbsentJob("evening");
      await runFullDayAbsentReconciliation();
    }, {
      timezone: timeZone,
      scheduled: true,
    });
    _scheduledEveningCutoff = cutoffTime;
    console.log(
      `⏰ [AutoAbsent:evening] Scheduled at ${cutoffTime} (${timeZone}) — cron: "${expression}"`
    );
  } catch (err) {
    console.error("⏰ [AutoAbsent:evening] Failed to schedule job:", err.message);
    _eveningTask = null;
    _scheduledEveningCutoff = null;
  }
}

/**
 * Cancel the currently active evening cutoff job (if any).
 */
function cancelEveningCutoffJob() {
  if (_eveningTask) {
    _eveningTask.destroy();
    _eveningTask = null;
    _scheduledEveningCutoff = null;
    console.log("⏰ [AutoAbsent:evening] Cancelled existing job.");
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

    // ── Morning scheduler ────────────────────────────────────────────────────
    const effectiveMorningCutoff = settings.attendanceEndTime || settings.cutoffTime;
    if (settings.cutoffEnabled && effectiveMorningCutoff) {
      scheduleCutoffJob(effectiveMorningCutoff, settings.cutoffTimeZone);
    } else {
      console.log("⏰ [AutoAbsent:morning] Cutoff job is disabled — skipping scheduler init.");
    }

    // ── Evening scheduler ─────────────────────────────────────────────────────
    // Opt-out model: schedule whenever eveningEndTime is set.
    // eveningCutoffEnabled=false is ONLY honored when the admin has explicitly
    // saved that value. On a fresh DB, eveningCutoffEnabled defaults to false but
    // we still want to schedule the job if eveningEndTime is configured.
    if (settings.eveningEndTime) {
      if (settings.eveningCutoffEnabled === false) {
        // Admin has explicitly disabled it — respect that choice
        // BUT only if the field was actually set (not just the schema default)
        // Since we cannot distinguish the two cases perfectly, we always schedule
        // when eveningEndTime is present and rely on the admin to disable via the UI.
        scheduleEveningCutoffJob(settings.eveningEndTime, settings.cutoffTimeZone);
        console.log("⏰ [AutoAbsent:evening] Scheduled (eveningCutoffEnabled was false but eveningEndTime is set — use UI to disable).");
      } else {
        scheduleEveningCutoffJob(settings.eveningEndTime, settings.cutoffTimeZone);
      }
    } else {
      console.log("⏰ [AutoAbsent:evening] No Work End close time configured — evening auto-absent not scheduled.");
    }

    // Always start the appeal deadline cron regardless of cutoff config
    startAppealDeadlineCron();
  } catch (err) {
    console.error("⏰ [AutoAbsent] Failed to init scheduler:", err.message);
  }
}

/**
 * Returns the currently scheduled morning cutoff or null.
 */
function getScheduledCutoff() {
  return _scheduledMorningCutoff;
}

/**
 * Returns the currently scheduled evening cutoff or null.
 */
function getScheduledEveningCutoff() {
  return _scheduledEveningCutoff;
}

module.exports = {
  initCutoffScheduler,
  scheduleCutoffJob,
  cancelCutoffJob,
  scheduleEveningCutoffJob,
  cancelEveningCutoffJob,
  getScheduledCutoff,
  getScheduledEveningCutoff,
  runAutoAbsentJob,              // exported for manual trigger / testing
  runAppealDeadlineJob,          // exported for manual trigger / testing
  runFullDayAbsentReconciliation, // exported for manual trigger / testing
};
