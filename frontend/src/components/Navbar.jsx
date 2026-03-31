// src/components/Navbar.jsx

import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isLinkActive(pathname, href) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Resolve the full image URL from the value stored in context. */
function resolveAvatarUrl(user) {
  if (!user) return null;
  if (user.profileImageUrl) return user.profileImageUrl;
  if (user.profileImage) return `/${user.profileImage}`;
  return null;
}

// ── Avatar component ──────────────────────────────────────────────────────────
// Shows a circular profile photo if available; otherwise shows initials.

function Avatar({ user, size = "md" }) {
  const sizeClasses = {
    sm: "h-7 w-7 text-xs",
    md: "h-9 w-9 text-sm",
    lg: "h-11 w-11 text-base",
  };
  const cls = `${sizeClasses[size]} flex-shrink-0 rounded-full object-cover`;

  const initials = user?.name
    ? user.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "?";

  const src = resolveAvatarUrl(user);
  const [broken, setBroken] = useState(false);

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={user?.name ?? "Profile"}
        className={`${cls} border border-slate-200`}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div
      className={`${cls} flex items-center justify-center bg-blue-600 font-semibold text-white`}
    >
      {initials}
    </div>
  );
}

// ── NavLink ───────────────────────────────────────────────────────────────────

function NavLink({ link, pathname, mobile = false }) {
  const active = isLinkActive(pathname, link.to);

  if (mobile) {
    return (
      <Link
        to={link.to}
        className={`flex min-w-0 flex-1 items-center justify-center rounded-2xl px-3 py-3 text-xs font-semibold transition ${
          active ? "bg-blue-50 text-blue-700" : "text-slate-500"
        }`}
      >
        {link.mobileLabel}
        {link.badge && (
          <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
            {link.badge > 99 ? "99+" : link.badge}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      to={link.to}
      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition ${
        active
          ? "border-blue-100 bg-blue-50 text-blue-700"
          : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center gap-2">
        <span>{link.label}</span>
        {link.badge && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
            {link.badge > 99 ? "99+" : link.badge}
          </span>
        )}
      </div>
      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{link.shortLabel}</span>
    </Link>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (user?.role === "admin") {
      api.get("/attendance/pending-counts")
        .then((res) => setPendingCount(res.data.count))
        .catch(() => {});
    }
  }, [user, location.pathname]); // Update on nav

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const userLinks = [
    { to: "/dashboard",       label: "Overview",           mobileLabel: "Home",     shortLabel: "OV" },
    { to: "/mark-attendance", label: "Mark Attendance",    mobileLabel: "Mark",     shortLabel: "AT" },
    { to: "/my-attendance",   label: "Attendance History", mobileLabel: "History",  shortLabel: "HS" },
    { to: "/leaves",          label: "My Leaves",          mobileLabel: "Leaves",   shortLabel: "LV" },
    { to: "/register-face",   label: "Face Registration",  mobileLabel: "Face",     shortLabel: "FR" },
  ];

  const adminLinks = [
    { to: "/admin",              label: "Dashboard",  mobileLabel: "Home",     shortLabel: "DB" },
    { to: "/admin/users",        label: "Users",      mobileLabel: "Users",    shortLabel: "US" },
    { to: "/admin/attendance",   label: "Attendance", mobileLabel: "Records",  shortLabel: "AR" },
    { to: "/admin/settings",     label: "Settings",   mobileLabel: "Settings", shortLabel: "ST" },
    { to: "/admin/location",     label: "Location",   mobileLabel: "Location", shortLabel: "LC" },
    { to: "/admin/requests",     label: "Requests & Appeals", mobileLabel: "Requests", shortLabel: "RQ", badge: pendingCount > 0 ? pendingCount : null },
  ];

  const links = user?.role === "admin" ? adminLinks : userLinks;
  const roleLabel = user?.role === "admin" ? "Administrator" : "Employee";

  return (
    <>
      {/* ── Top header ── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            to={user?.role === "admin" ? "/admin" : "/dashboard"}
            className="flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-sm font-semibold text-white">
              AS
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Attendance System</p>
              <p className="text-xs text-slate-500">Location and face verification</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {/* Profile avatar + name */}
            <div className="flex items-center gap-2.5">
              <Avatar user={user} size="md" />
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
                <p className="text-xs text-slate-500">{roleLabel}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="btn-secondary">
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── Sidebar ── */}
      <aside className="fixed bottom-0 left-0 top-16 hidden w-64 border-r border-slate-200 bg-white/80 px-4 py-6 backdrop-blur md:flex md:flex-col">
        <div className="space-y-2">
          {links.map((link) => (
            <NavLink key={link.to} link={link} pathname={location.pathname} />
          ))}
        </div>

        {/* Session card with avatar */}
        <div className="card-muted mt-auto p-4">
          <p className="section-label">Session</p>
          <div className="mt-3 flex items-center gap-3">
            <Avatar user={user} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Attendance is only accepted when location and face verification both pass.
          </p>
        </div>
      </aside>

      {/* ── Mobile bottom nav ── */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          {links.map((link) => (
            <NavLink key={link.to} link={link} pathname={location.pathname} mobile />
          ))}
        </div>
      </nav>
    </>
  );
}