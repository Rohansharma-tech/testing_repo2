// src/App.jsx — Main App with React Router Setup

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";

// Pages
import LoginPage from "./pages/LoginPage";
import UserDashboard from "./pages/UserDashboard";
import MarkAttendancePage from "./pages/MarkAttendancePage";
import RegisterFacePage from "./pages/RegisterFacePage";
import MyAttendancePage from "./pages/MyAttendancePage";
import AdminDashboard from "./pages/AdminDashboard";
import UserManagementPage from "./pages/UserManagementPage";
import AttendanceTablePage from "./pages/AttendanceTablePage";
import CutoffSettingsPage from "./pages/CutoffSettingsPage";
import LocationSettingsPage from "./pages/Locationsettingpage";
import LeaveManagementPage from "./pages/LeaveManagementPage";
import AdminLeavesAppealsPage from "./pages/AdminLeavesAppealsPage";

// ---- Protected Route Wrapper ----
function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-500">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/dashboard" replace />;

  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace /> : <LoginPage />}
      />

      {/* ── User routes ── */}
      <Route path="/dashboard"       element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
      <Route path="/mark-attendance" element={<ProtectedRoute><MarkAttendancePage /></ProtectedRoute>} />
      <Route path="/register-face"   element={<ProtectedRoute><RegisterFacePage /></ProtectedRoute>} />
      <Route path="/my-attendance"   element={<ProtectedRoute><MyAttendancePage /></ProtectedRoute>} />
      <Route path="/leaves"          element={<ProtectedRoute><LeaveManagementPage /></ProtectedRoute>} />

      {/* ── Admin routes ── */}
      <Route path="/admin"             element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/users"       element={<ProtectedRoute adminOnly><UserManagementPage /></ProtectedRoute>} />
      <Route path="/admin/attendance"  element={<ProtectedRoute adminOnly><AttendanceTablePage /></ProtectedRoute>} />
      <Route path="/admin/settings"    element={<ProtectedRoute adminOnly><CutoffSettingsPage /></ProtectedRoute>} />
      <Route path="/admin/location"    element={<ProtectedRoute adminOnly><LocationSettingsPage /></ProtectedRoute>} />
      <Route path="/admin/requests"    element={<ProtectedRoute adminOnly><AdminLeavesAppealsPage /></ProtectedRoute>} />

      {/* ── Fallbacks ── */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}