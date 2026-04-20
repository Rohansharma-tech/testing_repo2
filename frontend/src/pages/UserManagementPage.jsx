import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";

function UserAvatar({ user, size = "md" }) {
  const sizeClasses = { sm: "h-8 w-8 text-xs", md: "h-9 w-9 text-sm", lg: "h-11 w-11 text-base" };
  const base = `${sizeClasses[size]} flex-shrink-0 rounded-full object-cover`;
  const initials = (user.firstName || user.name || "?").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const src = user.profileImageUrl || (user.profileImage ? `/${user.profileImage}` : null);
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img src={src} alt={user.name} className={`${base} border border-slate-200`} onError={() => setBroken(true)} />;
  return <div className={`${base} flex items-center justify-center bg-blue-600 font-semibold text-white`}>{initials}</div>;
}

function formatDate(isoDate) {
  if (!isoDate) return "—";
  return new Date(isoDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const EMP_TYPE_COLORS = {
  "Full-Time": "status-chip-success",
  "Part-Time": "status-chip-info",
  "Contract": "status-chip-warning",
  "Intern": "status-chip-neutral",
};

export default function UserManagementPage() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const isReadOnly = authUser?.role !== "admin"; // Only Admin can edit/deactivate users

  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showToast, ToastContainer } = useToast();

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchUsers = async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data);
    } catch {
      showToast("Failed to load users.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get("/users/departments")
      .then(res => setDepartments(res.data.map(d => typeof d === "string" ? d : d.name)))
      .catch(() => {});
    fetchUsers();
  }, []);

  const allDepartments = useMemo(() => {
    const fromUsers = users.map(u => u.department).filter(Boolean);
    return [...new Set([...departments, ...fromUsers])].sort();
  }, [departments, users]);

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.delete(`/users/${deleteConfirm.id}`);
      showToast(`"${deleteConfirm.name}" has been deactivated.`, "success");
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to deactivate user.", "error");
    } finally {
      setDeleteConfirm(null);
    }
  };

  // Show ALL roles — employee, hod, principal (admin excluded from list for clarity)
  const nonAdminUsers = users.filter(u => u.role !== "admin");
  const filteredUsers = useMemo(() => {
    let r = users.filter(u => u.role !== "admin"); // show all non-admin
    const q = search.trim().toLowerCase();
    if (q) r = r.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.firstName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.employeeId?.toLowerCase().includes(q) ||
      u.designation?.toLowerCase().includes(q)
    );
    if (deptFilter) r = r.filter(u => u.department === deptFilter);
    if (dateFrom) r = r.filter(u => u.dateOfJoin && u.dateOfJoin.slice(0, 10) >= dateFrom);
    if (dateTo) r = r.filter(u => u.dateOfJoin && u.dateOfJoin.slice(0, 10) <= dateTo);
    return r;
  }, [users, search, deptFilter, dateFrom, dateTo]);

  const hasFilters = search || deptFilter || dateFrom || dateTo;
  const faceReady = nonAdminUsers.filter(u => u.hasFace).length;
  const hodCount = users.filter(u => u.role === "hod").length;
  const principalCount = users.filter(u => u.role === "principal").length;
  const employeeCount = users.filter(u => u.role === "user").length;

  return (
    <PageWrapper
      title="User Management"
      description="Manage employee accounts. Employee IDs are auto-generated on creation."
    >
      <ToastContainer />

      {/* Deactivate confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 pb-4 pt-6">
              <p className="section-label">Deactivate Account</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">{deleteConfirm.name}</h2>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="text-sm text-slate-600">This account will be <strong>disabled</strong>. All historical attendance records are preserved.</p>
              <div className="flex items-center gap-3">
                <button onClick={confirmDelete} className="btn-danger">Deactivate</button>
                <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-5">
        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="card py-4">
            <p className="section-label">Total Staff</p>
            <p className="metric-value mt-3">{nonAdminUsers.length}</p>
          </div>
          <div className="card py-4">
            <p className="section-label">Employees</p>
            <p className="metric-value mt-3 text-blue-600">{employeeCount}</p>
          </div>
          <div className="card py-4">
            <p className="section-label">HODs</p>
            <p className="metric-value mt-3 text-violet-600">{hodCount}</p>
          </div>
          <div className="card py-4">
            <p className="section-label">Principals</p>
            <p className="metric-value mt-3 text-emerald-600">{principalCount}</p>
          </div>
        </div>

        {/* Control bar */}
        <div className="card py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 16.65a7.5 7.5 0 0012.15 0z" /></svg>
              <input type="text" className="input-field pl-10" placeholder="Search name, email, ID, designation…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="input-field w-auto" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="">All departments</option>
              {allDepartments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <div className="flex items-center gap-2">
              <input type="date" className="input-field w-auto" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Joined from" />
              <span className="flex-shrink-0 text-xs text-slate-400">to</span>
              <input type="date" className="input-field w-auto" value={dateTo} onChange={e => setDateTo(e.target.value)} title="Joined to" />
            </div>
            {hasFilters && (
              <button onClick={() => { setSearch(""); setDeptFilter(""); setDateFrom(""); setDateTo(""); }} className="btn-secondary text-sm">Clear</button>
            )}
            {!isReadOnly && (
              <button onClick={() => navigate("/admin/users/new")} className="btn-primary flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Add User
              </button>
            )}
            {isReadOnly && (
              <span className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                Read-only view
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <p className="section-label">All Staff</p>
              <p className="mt-1 text-sm text-slate-500">
                {filteredUsers.length} {filteredUsers.length === 1 ? "user" : "users"}
                {hasFilters && <span className="text-slate-400"> (filtered from {nonAdminUsers.length} total)</span>}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="divide-y divide-slate-100">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-36 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-48 animate-pulse rounded bg-slate-200" />
                    </div>
                    <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-5 w-24 animate-pulse rounded-full bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-medium text-slate-500">No employees match the current filters.</p>
                {hasFilters && (
                  <button onClick={() => { setSearch(""); setDeptFilter(""); setDateFrom(""); setDateTo(""); }} className="mt-3 text-sm font-semibold text-blue-600 hover:underline">
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Emp ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Designation</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Mobile</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Joined</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map(user => (
                    <tr key={user._id} className="transition-colors hover:bg-slate-50">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <UserAvatar user={user} size="md" />
                          <div>
                            <p className="font-medium text-slate-900">{user.firstName || user.name}</p>
                            <p className="text-xs text-slate-400">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {user.employeeId ? (
                          <span className="font-mono text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg">{user.employeeId}</span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      {/* Role badge */}
                      <td className="px-4 py-3.5">
                        {user.role === "hod" && <span className="status-chip bg-violet-50 text-violet-700 border border-violet-200">HOD</span>}
                        {user.role === "principal" && <span className="status-chip bg-emerald-50 text-emerald-700 border border-emerald-200">Principal</span>}
                        {user.role === "user" && <span className="status-chip bg-slate-100 text-slate-600">Employee</span>}
                        {user.role === "admin" && <span className="status-chip bg-rose-50 text-rose-700">Admin</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-slate-600">{user.designation || <span className="text-slate-400">—</span>}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        {user.department ? (
                          <span className="status-chip bg-slate-100 text-slate-600">{user.department}</span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {user.employeeType ? (
                          <span className={`status-chip ${EMP_TYPE_COLORS[user.employeeType] || "status-chip-neutral"}`}>{user.employeeType}</span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">{user.mobileNo || "—"}</td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">{formatDate(user.dateOfJoin || user.createdAt)}</td>
                      <td className="px-4 py-3.5 text-right">
                        {!user.isDeleted ? (
                          <div className="flex items-center justify-end gap-2">
                            {!isReadOnly && (
                              <button
                                onClick={() => navigate(`/admin/users/${user._id}/edit`)}
                                className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                              >
                                Edit
                              </button>
                            )}
                            {!isReadOnly && user.role !== "admin" && (
                              <button
                                onClick={() => setDeleteConfirm({ id: user._id, name: user.firstName || user.name })}
                                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                              >
                                Deactivate
                              </button>
                            )}
                            {isReadOnly && <span className="text-xs text-slate-400">—</span>}
                          </div>
                        ) : (
                          <span className="status-chip status-chip-danger">Inactive</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}