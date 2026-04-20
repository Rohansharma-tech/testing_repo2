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
import CreateUserPage from "./pages/CreateUserPage";
import EditUserPage from "./pages/EditUserPage";
import AttendanceTablePage from "./pages/AttendanceTablePage";
import CutoffSettingsPage from "./pages/CutoffSettingsPage";
import LocationSettingsPage from "./pages/Locationsettingpage";
import LeaveManagementPage from "./pages/LeaveManagementPage";
import AdminLeavesAppealsPage from "./pages/AdminLeavesAppealsPage";
import HodLeavePage from "./pages/HodLeavePage";
import PrincipalLeavePage from "./pages/PrincipalLeavePage";
import PrincipalDashboard from "./pages/PrincipalDashboard";
import ProfilePage from "./pages/ProfilePage";

// ---- Protected Route Wrapper ----
function ProtectedRoute({ children, adminOnly = false, allowedRoles = null }) {
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

  // Determine the role's home page for redirect when access is denied
  const roleHome =
    user.role === "admin"      ? "/admin" :
    user.role === "principal"  ? "/principal/leaves" :
    user.role === "hod"        ? "/hod/leaves" :
    "/dashboard";

  if (adminOnly && user.role !== "admin") return <Navigate to={roleHome} replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to={roleHome} replace />;

  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user
            ? <Navigate to={
                user.role === "admin" ? "/admin" :
                user.role === "hod" ? "/hod/leaves" :
                user.role === "principal" ? "/principal/leaves" :
                "/dashboard"
              } replace />
            : <LoginPage />
        }
      />

      {/* ── Employee routes (HOD + Employee only, not Principal) ── */}
      <Route path="/dashboard"       element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
      <Route path="/mark-attendance" element={<ProtectedRoute allowedRoles={["admin","hod","user"]}><MarkAttendancePage /></ProtectedRoute>} />
      <Route path="/register-face"   element={<ProtectedRoute allowedRoles={["admin","hod","user"]}><RegisterFacePage /></ProtectedRoute>} />
      <Route path="/my-attendance"   element={<ProtectedRoute><MyAttendancePage /></ProtectedRoute>} />
      <Route path="/leaves"          element={<ProtectedRoute><LeaveManagementPage /></ProtectedRoute>} />

      {/* ── Admin routes ── */}
      <Route path="/admin"           element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/users/new"      element={<ProtectedRoute adminOnly><CreateUserPage /></ProtectedRoute>} />
      <Route path="/admin/users/:id/edit" element={<ProtectedRoute adminOnly><EditUserPage /></ProtectedRoute>} />
      {/* Admin + Principal can view user list */}
      <Route path="/admin/users"     element={<ProtectedRoute allowedRoles={["admin", "principal"]}><UserManagementPage /></ProtectedRoute>} />
      {/* Admin + Principal can view attendance records */}
      <Route path="/admin/attendance" element={<ProtectedRoute allowedRoles={["admin", "principal"]}><AttendanceTablePage /></ProtectedRoute>} />
      <Route path="/admin/settings"  element={<ProtectedRoute adminOnly><CutoffSettingsPage /></ProtectedRoute>} />
      <Route path="/admin/location"  element={<ProtectedRoute adminOnly><LocationSettingsPage /></ProtectedRoute>} />
      <Route path="/admin/requests"  element={<ProtectedRoute adminOnly><AdminLeavesAppealsPage /></ProtectedRoute>} />

      {/* ── HOD routes ── */}
      <Route path="/hod/leaves" element={<ProtectedRoute allowedRoles={["hod"]}><HodLeavePage /></ProtectedRoute>} />

      {/* ── Principal routes ── */}
      <Route path="/principal/leaves"    element={<ProtectedRoute allowedRoles={["principal"]}><PrincipalLeavePage /></ProtectedRoute>} />
      <Route path="/principal/dashboard" element={<ProtectedRoute allowedRoles={["principal"]}><PrincipalDashboard /></ProtectedRoute>} />

      {/* ── Self-service profile edit — Admin ONLY (Admin manages all user data) ── */}
      <Route path="/profile" element={<ProtectedRoute adminOnly><ProfilePage /></ProtectedRoute>} />

      {/* ── Fallbacks ── */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}