// src/context/AuthContext.jsx — Global Authentication State
// JWT lives in an HttpOnly cookie — never touched by JS.
// User profile is kept only in React state (memory), not localStorage.

import { createContext, useContext, useState, useEffect } from "react";
import api from "../api/axios";

const AuthContext = createContext(null);

/** Normalize the raw API response into the shape the app expects. */
function normalizeUser(data) {
  return {
    id: data.id || data._id,
    name: data.name,
    email: data.email,
    role: data.role,
    hasFace: data.hasFace,
    department: data.department ?? null,
    profileImage: data.profileImage ?? null,       // relative DB path or null
    profileImageUrl: data.profileImageUrl ?? null, // absolute URL returned by API
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: hit /auth/session — always returns 200 with either the user object
  // or { user: null }. This avoids the red 401 console error that /auth/me
  // produces when the user isn't logged in yet.
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const res = await api.get("/auth/session");
        if (isMounted) {
          setUser(res.data.user ? normalizeUser(res.data.user) : null);
        }
      } catch {
        // Unexpected network error — treat as no session
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    restoreSession();
    return () => { isMounted = false; };
  }, []);

  const login = async (email, password) => {
    // Server sets the HttpOnly cookie; response body contains only user data
    const res = await api.post("/auth/login", { email, password });
    const normalized = normalizeUser(res.data.user);
    setUser(normalized);
    return normalized;
  };

  const logout = async () => {
    try {
      // Tell the server to clear the HttpOnly cookie
      await api.post("/auth/logout");
    } catch {
      // Even if the request fails, clear local state
    } finally {
      setUser(null);
      window.location.href = "/login";
    }
  };

  const updateUser = (updates) => {
    setUser((current) => ({ ...current, ...updates }));
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}