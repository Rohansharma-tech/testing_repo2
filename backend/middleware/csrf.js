// =============================================================================
// middleware/csrf.js — CSRF Protection (Custom Request Header Pattern)
// =============================================================================
//
// Attack scenario this prevents:
//   1. Admin logs into the attendance app (server sets HttpOnly cookie)
//   2. Admin visits evil.com in another tab
//   3. evil.com runs: fetch("https://api.myapp.com/api/settings", { method:"PUT", ... })
//   4. Browser DOES attach the cookie (because SameSite=None in production)
//   5. BUT — browser's CORS preflight blocks evil.com from setting custom headers
//   6. Our middleware sees no "X-Requested-With" header → rejects with 403
//
// Why this works:
//   Simple cross-origin HTML forms and fetch() requests WITHOUT CORS approval
//   CANNOT set custom headers. Only our own React frontend (whitelisted origin)
//   can pass the preflight check and set "X-Requested-With".
//
// Safe-to-skip methods: GET, HEAD, OPTIONS are read-only and safe by design.
// =============================================================================

const CSRF_HEADER = "x-requested-with";
const CSRF_VALUE  = "XMLHttpRequest";

// State-changing HTTP methods that require the CSRF check
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * csrfProtect — Express middleware.
 * Rejects any state-changing request that is missing the custom CSRF header.
 *
 * Frontend must send this header on every non-GET request:
 *   headers: { "X-Requested-With": "XMLHttpRequest" }
 *
 * Exemptions (no header needed):
 *   - GET, HEAD, OPTIONS (safe/read-only)
 *   - Server-to-server calls (no Origin header, no browser involved)
 */
function csrfProtect(req, res, next) {
  // Skip safe methods (can't be exploited by CSRF)
  if (!UNSAFE_METHODS.has(req.method)) return next();

  // Skip server-to-server calls (no browser Origin header means no cookie)
  // A real CSRF attack always comes from a browser with an Origin set.
  const origin = req.headers.origin;
  if (!origin) return next();

  // ─── Main check ───────────────────────────────────────────────────────────
  const header = req.headers[CSRF_HEADER];
  if (!header || header.toLowerCase() !== CSRF_VALUE.toLowerCase()) {
    console.warn(
      `[CSRF] Rejected ${req.method} ${req.path} from origin "${origin}" — missing X-Requested-With header`
    );
    return res.status(403).json({
      message: "Forbidden: CSRF check failed. Request must include the X-Requested-With header.",
    });
  }

  next();
}

module.exports = { csrfProtect };
