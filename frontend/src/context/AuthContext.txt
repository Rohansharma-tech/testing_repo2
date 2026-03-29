// src/context/AuthContext.jsx — Global Authentication State
// Uses React Context to share login state across all components
// without prop-drilling

import { createContext, useContext, useState, useEffect } from "react";
import api from "../api/axios";

// Create the context
const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const storedUser = localStorage.getItem("user");
    return storedUser ? JSON.parse(storedUser) : null;
  } catch {
    localStorage.removeItem("user");
    return null;
  }
}

// ---- AuthProvider Component ----
// Wrap the entire app with this to share auth state everywhere
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // Prevent flash before checking token

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      const storedUser = readStoredUser();
      const token = localStorage.getItem("token");

      if (!token) {
        if (isMounted) {
          setLoading(false);
        }
        return;
      }

      if (storedUser && isMounted) {
        setUser(storedUser);
      }

      try {
        const res = await api.get("/auth/me");
        const normalizedUser = {
          id: res.data.id || res.data._id,
          name: res.data.name,
          email: res.data.email,
          role: res.data.role,
          hasFace: res.data.hasFace,
        };

        localStorage.setItem("user", JSON.stringify(normalizedUser));

        if (isMounted) {
          setUser(normalizedUser);
        }
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("user");

        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  // ---- Login Function ----
  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    const { token, user: userData } = res.data;

    // Save to localStorage so session persists on page refresh
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(userData));

    setUser(userData);
    return userData;
  };

  // ---- Logout Function ----
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  // ---- Update User State (e.g., after face registration) ----
  const updateUser = (updates) => {
    setUser((currentUser) => {
      const updated = { ...currentUser, ...updates };
      localStorage.setItem("user", JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook for easy access to auth context
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
