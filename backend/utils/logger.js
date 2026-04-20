// =============================================
// utils/logger.js — Winston Structured Logging
// =============================================
// Logs security events (login, refresh, role changes, suspicious activity)
// to both console and rotating daily log files.
// =============================================

const { createLogger, format, transports } = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");

const { combine, timestamp, printf, colorize, errors } = format;

// ── Log format ─────────────────────────────────────────────────────────────────

const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}${metaStr}`;
});

// ── Transports ────────────────────────────────────────────────────────────────

const fileTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: "app-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxFiles: "14d",       // keep 14 days of logs
  maxSize: "20m",
  format: combine(timestamp(), errors({ stack: true }), logFormat),
});

const securityTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: "security-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxFiles: "30d",       // keep security logs 30 days
  maxSize: "20m",
  level: "warn",         // only WARN + ERROR go to security log
  format: combine(timestamp(), errors({ stack: true }), logFormat),
});

// ── Logger instance ───────────────────────────────────────────────────────────

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(timestamp(), errors({ stack: true }), logFormat),
  transports: [
    new transports.Console({
      format: combine(colorize(), timestamp(), errors({ stack: true }), logFormat),
    }),
    fileTransport,
    securityTransport,
  ],
});

// ── Security-specific helpers ─────────────────────────────────────────────────

logger.security = {
  loginSuccess: (email, ip, role) =>
    logger.info("LOGIN_SUCCESS", { event: "auth", email, ip, role }),

  loginFail: (email, ip, reason) =>
    logger.warn("LOGIN_FAIL", { event: "auth", email, ip, reason }),

  tokenRefresh: (userId, ip) =>
    logger.info("TOKEN_REFRESH", { event: "auth", userId, ip }),

  tokenRefreshFail: (ip, reason) =>
    logger.warn("TOKEN_REFRESH_FAIL", { event: "auth", ip, reason }),

  tokenTheft: (userId, ip, family) =>
    logger.error("TOKEN_THEFT_DETECTED", { event: "security", userId, ip, family, action: "all_family_sessions_revoked" }),

  logout: (userId, ip) =>
    logger.info("LOGOUT", { event: "auth", userId, ip }),

  unauthorizedAccess: (userId, role, path, method) =>
    logger.warn("UNAUTHORIZED_ACCESS", { event: "rbac", userId, role, path, method }),

  roleViolation: (userId, role, requiredRole, path) =>
    logger.warn("ROLE_VIOLATION", { event: "rbac", userId, role, requiredRole, path }),

  userCreated: (adminId, newUserId, newRole) =>
    logger.info("USER_CREATED", { event: "admin", adminId, newUserId, newRole }),

  userDeactivated: (adminId, targetId) =>
    logger.warn("USER_DEACTIVATED", { event: "admin", adminId, targetId }),

  suspiciousInput: (ip, path, reason) =>
    logger.warn("SUSPICIOUS_INPUT", { event: "security", ip, path, reason }),
};

module.exports = logger;
