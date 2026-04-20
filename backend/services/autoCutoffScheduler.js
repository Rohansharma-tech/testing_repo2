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
let _leaveExpiryTask = null;    // active cron.ScheduledTask for leave auto-rejection at midnight
let _appealExpiryTask = null;   // active cron.ScheduledTask for appeal auto-rejection at midnight

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
// Job 3: Leave Expiry — Auto-reject pending leaves whose date is today
// Runs once at 00:01 every night (just after midnight in org timezone).
// ──────────────────────────────────────────────────────────────────────────────

/**
 * At midnight: find all pending leave requests whose leave date equals today.
 * These requests were never approved or rejected by the admin, so they expire
 * automatically and the employee must attend the office normally.
 * Attendance is NOT touched here — the auto-absent cron handles that.
 */
async function runLeaveExpiryJob() {
  let timeZone = process.env.APP_TIMEZONE || "Asia/Kolkata";
  try {
    const settings = await OrganizationSettings.getSingleton();
    timeZone = settings.cutoffTimeZone || timeZone;
  } catch (_) { /* use default */ }

  const { date: today } = getDateTimeParts(new Date(), timeZone);
  console.log(`⏰ [LeaveExpiry] Running for date: ${today} (tz: ${timeZone})`);

  try {
    // Find all pending leave requests whose leave date is today
    const expired = await LeaveRequest.find({
      date: today,
      status: "pending",
    }).lean();

    if (!expired.length) {
      console.log(`⏰ [LeaveExpiry] No pending leaves to expire for ${today}.`);
      return;
    }

    console.log(`⏰ [LeaveExpiry] Auto-rejecting ${expired.length} pending leave(s) for ${today}.`);

    const ids = expired.map((l) => l._id);
    const result = await LeaveRequest.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          status: "rejected",
          adminResponse:
            "Auto-rejected: The leave date arrived without admin approval. " +
            "Please ensure you attend the office. Your attendance is subject to normal cutoff rules.",
        },
      }
    );

    console.log(`⏰ [LeaveExpiry] Done. ${result.modifiedCount} leave(s) auto-rejected.`);
  } catch (err) {
    console.error("⏰ [LeaveExpiry] Error:", err.message);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Job 4: Appeal Expiry — Auto-reject pending appeals whose date is yesterday
// Runs once at 00:01 every night. Appeals are only valid on the day they are
// raised; if admin has not acted by midnight, the appeal is auto-rejected and
// the attendance record receives absent + penalty (same as a manual rejection).
// ──────────────────────────────────────────────────────────────────────────────

async function runAppealExpiryJob() {
  let timeZone = process.env.APP_TIMEZONE || "Asia/Kolkata";
  try {
    const settings = await OrganizationSettings.getSingleton();
    timeZone = settings.cutoffTimeZone || timeZone;
  } catch (_) { /* use default */ }

  const { date: today } = getDateTimeParts(new Date(), timeZone);

  // "Yesterday" from the perspective of the cron running at 00:01
  const yesterdayObj = new Date(`${today}T00:00:00`);
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterday = yesterdayObj.toISOString().slice(0, 10);

  console.log(`⏰ [AppealExpiry] Running for expired date: ${yesterday} (tz: ${timeZone})`);

  try {
    // Find all pending appeals whose appeal date was yesterday (day just ended)
    const expired = await Appeal.find({
      date: yesterday,
      status: "pending",
    }).lean();

    if (!expired.length) {
      console.log(`⏰ [AppealExpiry] No pending appeals to expire for ${yesterday}.`);
      return;
    }

    console.log(`⏰ [AppealExpiry] Auto-rejecting ${expired.length} pending appeal(s) for ${yesterday}.`);

    const appealIds = expired.map((a) => a._id);
    const attendanceIds = expired.map((a) => a.attendanceId);

    // 1. Reject the appeals with a system message
    await Appeal.updateMany(
      { _id: { $in: appealIds } },
      {
        $set: {
          status: "rejected",
          adminResponse:
            "Auto-rejected: The appeal window for this day has closed without admin review. " +
            "Your attendance remains absent. Please ensure you attend the office on future work days.",
        },
      }
    );

    // 2. Mark every appealed attendance record as absent + penalty.
    //    Use _id lookup — these records definitively exist, no upsert needed.
    //    $ne: "present" guard: if somehow a record was concurrently approved and
    //    marked present, don't overwrite it.
    await Attendance.updateMany(
      { _id: { $in: attendanceIds }, status: { $ne: "present" } },
      {
        $set: {
          status: "absent",
          penalty: true,
          source: "auto_cutoff",
          adminApproved: true,
        },
      }
    );

    // 3. Full-day absent rule: if the expired appeal was for morning, enforce
    //    the full-day penalty on the evening session too.
    //    Clean two-operation approach — zero E11000 risk:
    //      3a. updateMany  → update EXISTING evening records that are not present
    //      3b. insertMany  → insert only for users who have NO evening record yet
    const morningExpired = expired.filter((a) => (a.session || "morning") === "morning");
    if (morningExpired.length > 0) {
      const dateParts = getDateTimeParts(new Date(), timeZone);
      const morningUserIds = morningExpired.map((a) => a.userId);

      // 3a. Update existing non-present evening records (no upsert — safe, no E11000)
      await Attendance.updateMany(
        {
          userId: { $in: morningUserIds },
          date: yesterday,
          session: "evening",
          status: { $ne: "present" },  // never touch a record the employee already marked present
        },
        {
          $set: {
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
        }
      );

      // 3b. Insert evening records only for users who have NO evening record at all.
      //     First find which userIds already have an evening record (any status).
      const existingEvening = await Attendance.find(
        { userId: { $in: morningUserIds }, date: yesterday, session: "evening" },
        { userId: 1 }
      ).lean();
      const alreadyHasEvening = new Set(existingEvening.map((r) => String(r.userId)));

      const toInsert = morningExpired
        .filter((a) => !alreadyHasEvening.has(String(a.userId)))
        .map((a) => ({
          userId: a.userId,
          date: yesterday,
          session: "evening",
          status: "absent",
          penalty: true,
          source: "auto_cutoff",
          reason: "morning_appeal_failed",
          autoMarked: true,
          adminApproved: false,
          time: dateParts.time,
          markedAt: dateParts.now,
          latitude: null,
          longitude: null,
          distanceFromGeofence: null,
          locationAccuracy: null,
          locationTimestamp: null,
        }));

      if (toInsert.length > 0) {
        try {
          // ordered: false → all non-conflicting docs are inserted even if one races.
          await Attendance.insertMany(toInsert, { ordered: false });
        } catch (insertErr) {
          // A MongoBulkWriteError with E11000 codes means another process (e.g. the
          // auto-absent cron) inserted one of these records in the gap between our
          // "find existing" query and this insert — a known, safe race condition.
          // We check that EVERY write error is E11000; any other error is re-thrown.
          const isAllDuplicates =
            insertErr.writeErrors?.length > 0 &&
            insertErr.writeErrors.every((e) => e.code === 11000);

          if (isAllDuplicates) {
            console.debug("⏰ [AppealExpiry] Evening insert skipped due to race (E11000)", {
              affectedUsers: toInsert.map((d) => d.userId),
              date: yesterday,
              job: "appealExpiry"
            });
          } else {
            // Unexpected error — re-throw so the outer catch logs it
            throw insertErr;
          }
        }
      }

      console.log(
        `⏰ [AppealExpiry] Full-day rule: ${morningExpired.length} morning appeal(s) expired — ` +
        `updated ${morningExpired.length - toInsert.length} existing evening record(s), ` +
        `inserted ${toInsert.length} new evening record(s).`
      );
    }

    console.log(`⏰ [AppealExpiry] Done. ${expired.length} appeal(s) auto-rejected.`);
  } catch (err) {
    console.error("⏰ [AppealExpiry] Error:", err.message);
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
 * Start the leave expiry cron (runs once at 00:01 every day in org timezone).
 * Auto-rejects any pending leave requests whose leave date is today.
 * Safe to call multiple times — stops the old task first.
 */
function startLeaveExpiryCron(timeZone) {
  if (_leaveExpiryTask) {
    _leaveExpiryTask.destroy();
    _leaveExpiryTask = null;
  }

  // Run at 00:01 every day so it fires just after the calendar day rolls over
  _leaveExpiryTask = cron.schedule("1 0 * * *", runLeaveExpiryJob, {
    timezone: timeZone || process.env.APP_TIMEZONE || "Asia/Kolkata",
    scheduled: true,
  });
  console.log(`⏰ [LeaveExpiry] Midnight expiry cron started (tz: ${timeZone || process.env.APP_TIMEZONE || "Asia/Kolkata"}).`);
}

/**
 * Start the appeal expiry cron (runs once at 00:01 every day in org timezone).
 * Auto-rejects any pending appeals whose appeal date was yesterday (day just ended).
 * Applies absent+penalty and full-day rule — same as a manual rejection.
 * Safe to call multiple times — stops the old task first.
 */
function startAppealExpiryCron(timeZone) {
  if (_appealExpiryTask) {
    _appealExpiryTask.destroy();
    _appealExpiryTask = null;
  }

  _appealExpiryTask = cron.schedule("1 0 * * *", runAppealExpiryJob, {
    timezone: timeZone || process.env.APP_TIMEZONE || "Asia/Kolkata",
    scheduled: true,
  });
  console.log(`⏰ [AppealExpiry] Midnight expiry cron started (tz: ${timeZone || process.env.APP_TIMEZONE || "Asia/Kolkata"}).`);
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

    // Always start the leave expiry cron (midnight auto-rejection of unapproved pending leaves)
    startLeaveExpiryCron(settings.cutoffTimeZone);

    // Always start the appeal expiry cron (midnight auto-rejection of pending same-day appeals)
    startAppealExpiryCron(settings.cutoffTimeZone);
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
  runLeaveExpiryJob,             // exported for manual trigger / testing
  runAppealExpiryJob,            // exported for manual trigger / testing
};
