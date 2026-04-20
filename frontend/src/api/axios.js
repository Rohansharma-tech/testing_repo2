// src/api/axios.js — Axios HTTP Client with Auto-Refresh Interceptor
//
// Token strategy:
//   Access token  → 30 min HttpOnly cookie "token"
//   Refresh token → 7 day HttpOnly cookie "refreshToken" (path: /api/auth)
//
// On any 401:
//   1. Try POST /api/auth/refresh (silently)
//   2. If refresh succeeds → retry the original request once
//   3. If refresh fails    → user is logged out, redirect to /login

import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// ── Main API instance ─────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
    // CSRF protection: custom header cannot be set by cross-origin forms/fetch
    "X-Requested-With": "XMLHttpRequest",
  },
  withCredentials: true, // send HttpOnly cookies automatically
});

// ── Refresh token instance ────────────────────────────────────────────────────
// Separate instance so it doesn't trigger its own interceptor recursively
const refreshApi = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
  },
  withCredentials: true,
});

// ── State: prevent multiple concurrent refresh calls ─────────────────────────
let isRefreshing = false;
let pendingQueue = []; // queued requests waiting for refresh to complete

function processQueue(error) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve();
  });
  pendingQueue = [];
}

// ── Response interceptor ──────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response, // pass-through on success

  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    // Endpoints that must NEVER trigger a refresh attempt:
    //   - /auth/login   → 401 means wrong password, not expired token
    //   - /auth/refresh → 401 means refresh token is gone/invalid
    //   - /auth/session → silent check; failure is expected when logged out
    const isAuthEndpoint = /\/auth\/(login|refresh|session)/.test(originalRequest.url || "");

    // Only attempt refresh on 401, and only once per request (prevent loops)
    if (
      status === 401 &&
      !originalRequest._retried &&
      !originalRequest.skipRefresh &&
      !isAuthEndpoint
    ) {
      originalRequest._retried = true;

      // If another refresh is already in flight, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        }).then(() => api(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        // Attempt to get a new access token using the refresh cookie
        await refreshApi.post("/auth/refresh");
        processQueue(null); // unblock all queued requests
        return api(originalRequest); // retry the original request
      } catch (refreshError) {
        processQueue(refreshError); // fail all queued requests
        // Refresh failed → session is dead → redirect to login
        if (window.location.pathname !== "/login" && window.location.pathname !== "/") {
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);


export default api;
