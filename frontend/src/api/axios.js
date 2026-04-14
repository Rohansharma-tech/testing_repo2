// src/api/axios.js — Axios HTTP Client Setup
// The JWT lives in an HttpOnly cookie — the browser sends it automatically.
// We never read or write the token from JS.

import axios from "axios";

// Create a custom axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json",
    // ← CSRF protection: this custom header cannot be set by cross-origin
    //   requests that fail the CORS preflight (i.e. malicious sites).
    //   The backend's csrfProtect middleware verifies its presence on all
    //   state-changing requests (POST / PUT / PATCH / DELETE).
    "X-Requested-With": "XMLHttpRequest",
  },
  // ← This is the key: tell the browser to include the HttpOnly cookie
  //   on every request (same as `fetch` with `credentials: "include"`)
  withCredentials: true,
});

// ---- Response Interceptor ----
// Handles 401 Unauthorized (expired/invalid token) globally.
// Requests can set `config.skipRedirect = true` to suppress the redirect
// (used by AuthContext's session-restore call, where a 401 just means
// "no active session" and is perfectly normal — not an error worth logging).
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const skipRedirect = error.config?.skipRedirect === true;

    if (status === 401 && !skipRedirect) {
      // Cookie is gone / expired — redirect to login
      if (window.location.pathname !== "/login" && window.location.pathname !== "/") {
        window.location.href = "/login";
      }
    }

    // Suppress console noise for expected 401s (e.g. /auth/me on first load)
    if (status === 401 && skipRedirect) {
      // Return a resolved promise so the caller's catch block still runs,
      // but the browser console stays clean.
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default api;
