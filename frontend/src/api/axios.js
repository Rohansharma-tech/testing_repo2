// src/api/axios.js — Axios HTTP Client Setup
// The JWT lives in an HttpOnly cookie — the browser sends it automatically.
// We never read or write the token from JS.

import axios from "axios";

// Create a custom axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json",
  },
  // ← This is the key: tell the browser to include the HttpOnly cookie
  //   on every request (same as `fetch` with `credentials: "include"`)
  withCredentials: true,
});

// ---- Response Interceptor ----
// Handles 401 Unauthorized (expired/invalid token) globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Cookie is gone / expired — redirect to login
      // No localStorage to clean up anymore
      if (window.location.pathname !== "/login" && window.location.pathname !== "/") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
