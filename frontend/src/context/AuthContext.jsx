// src/context/AuthContext.jsx — Global Authentication State (v2)
//
// Token strategy (matched to backend):
//   - /auth/session → checks 30-min access token cookie, returns user or { user: null, expired: true }
//   - If expired: true → silently call /auth/refresh to get a new access token
//   - axios interceptor handles 401 auto-refresh for all subsequent API calls
//   - logout-all endpoint revokes every session for the user

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";
import api from "../api/axios";

const AuthContext = createContext(null);

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// Standalone axios instance for session/refresh — bypasses the 401 interceptor
// to prevent circular redirect loops during initial page load
const silentApi = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
  withCredentials: true,
});

/** Normalize raw API user object → consistent app shape */
function normalizeUser(data) {
  if (!data) return null;
  return {
    id:              data.id || data._id,
    name:            data.name,
    email:           data.email,
    role:            data.role,
    hasFace:         data.hasFace,
    department:      data.department ?? null,
    profileImage:    data.profileImage ?? null,
    profileImageUrl: data.profileImageUrl ?? null,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Session restore on page load ─────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        // 1. Try to load from existing access token
        const res = await silentApi.get("/auth/session");

        if (!mounted) return;

        if (res.data.user) {
          setUser(normalizeUser(res.data.user));
          return;
        }

        // 2. Access token expired — try refresh silently
        if (res.data.expired) {
          try {
            const refreshRes = await silentApi.post("/auth/refresh");
            if (mounted && refreshRes.data.user) {
              setUser(normalizeUser(refreshRes.data.user));
              return;
            }
          } catch {
            // Refresh failed — no session
          }
        }

        if (mounted) setUser(null);
      } catch {
        // Network error or unexpected — treat as no session
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    restoreSession();
    return () => { mounted = false; };
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    const normalized = normalizeUser(res.data.user);
    setUser(normalized);
    return normalized;
  }, []);

  // ── Logout (current session only) ────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch { /* ignore — still clear */ }
    finally {
      setUser(null);
      window.location.href = "/login";
    }
  }, []);

  // ── Logout all sessions (nuclear) ────────────────────────────────────────────
  const logoutAll = useCallback(async () => {
    try {
      await api.post("/auth/logout-all");
    } catch { /* ignore */ }
    finally {
      setUser(null);
      window.location.href = "/login";
    }
  }, []);

  // ── Update local user state (e.g. after profile edit) ────────────────────────
  const updateUser = useCallback((updates) => {
    setUser((current) => current ? { ...current, ...updates } : null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, logoutAll, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}