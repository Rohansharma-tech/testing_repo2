import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function isLinkActive(pathname, href) {
  if (href === "/admin") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

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
      <span>{link.label}</span>
      <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{link.shortLabel}</span>
    </Link>
  );
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const userLinks = [
    { to: "/dashboard", label: "Overview", mobileLabel: "Home", shortLabel: "OV" },
    { to: "/mark-attendance", label: "Mark Attendance", mobileLabel: "Mark", shortLabel: "AT" },
    { to: "/my-attendance", label: "Attendance History", mobileLabel: "History", shortLabel: "HS" },
    { to: "/register-face", label: "Face Registration", mobileLabel: "Face", shortLabel: "FR" },
  ];

  const adminLinks = [
    { to: "/admin", label: "Dashboard", mobileLabel: "Home", shortLabel: "DB" },
    { to: "/admin/users", label: "Users", mobileLabel: "Users", shortLabel: "US" },
    { to: "/admin/attendance", label: "Attendance", mobileLabel: "Records", shortLabel: "AR" },
    { to: "/admin/settings", label: "Settings", mobileLabel: "Settings", shortLabel: "ST" },
  ];

  const links = user?.role === "admin" ? adminLinks : userLinks;
  const roleLabel = user?.role === "admin" ? "Administrator" : "Employee";

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to={user?.role === "admin" ? "/admin" : "/dashboard"} className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-sm font-semibold text-white">
              AS
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Attendance System</p>
              <p className="text-xs text-slate-500">Location and face verification</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
              <p className="text-xs text-slate-500">{roleLabel}</p>
            </div>
            <button onClick={handleLogout} className="btn-secondary">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-16 hidden w-64 border-r border-slate-200 bg-white/80 px-4 py-6 backdrop-blur md:flex md:flex-col">
        <div className="space-y-2">
          {links.map((link) => (
            <NavLink key={link.to} link={link} pathname={location.pathname} />
          ))}
        </div>

        <div className="card-muted mt-auto p-4">
          <p className="section-label">Session</p>
          <p className="mt-3 text-sm font-semibold text-slate-900">{user?.email}</p>
          <p className="mt-1 text-xs text-slate-500">
            Attendance is only accepted when location and face verification both pass.
          </p>
        </div>
      </aside>

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
