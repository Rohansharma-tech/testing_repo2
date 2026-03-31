// src/pages/UserManagementPage.jsx

import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";
import { useToast } from "../components/Toast";

// ─── Avatar helper ────────────────────────────────────────────────────────────

function UserAvatar({ user, size = "md" }) {
  const sizeClasses = { sm: "h-8 w-8 text-xs", md: "h-9 w-9 text-sm", lg: "h-11 w-11 text-base" };
  const base = `${sizeClasses[size]} flex-shrink-0 rounded-full object-cover`;

  const initials = user.name
    ? user.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "?";

  const src = user.profileImageUrl || (user.profileImage ? `/${user.profileImage}` : null);
  const [broken, setBroken] = useState(false);

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={user.name}
        className={`${base} border border-slate-200`}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div className={`${base} flex items-center justify-center bg-blue-600 font-semibold text-white`}>
      {initials}
    </div>
  );
}

// ─── Department dropdown ──────────────────────────────────────────────────────

function DepartmentDropdown({ departments, value, onChange, onAddDepartment, placeholder = "Select a department" }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAddDepartment(trimmed);
    onChange(trimmed);
    setNewName("");
    setAdding(false);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input-field flex w-full items-center justify-between text-left"
      >
        <span className={value ? "text-slate-900" : "text-slate-400"}>{value || placeholder}</span>
        <svg className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-2xl border border-slate-200 bg-white shadow-lg">
          <ul className="max-h-48 overflow-y-auto py-1">
            {departments.length === 0 && (
              <li className="px-4 py-3 text-sm text-slate-400">No departments yet. Add one below.</li>
            )}
            {departments.map((dept) => (
              <li key={dept}>
                <button
                  type="button"
                  onClick={() => { onChange(dept); setOpen(false); }}
                  className={`w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${value === dept ? "font-semibold text-blue-700" : "text-slate-700"}`}
                >
                  {dept}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100" />
          <div className="p-2">
            {adding ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
                    if (e.key === "Escape") { setAdding(false); setNewName(""); }
                  }}
                  placeholder="Department name"
                  className="input-field flex-1 py-1.5 text-sm"
                />
                <button type="button" onClick={handleAdd} className="btn-primary px-3 py-1.5 text-xs">Add</button>
                <button type="button" onClick={() => { setAdding(false); setNewName(""); }} className="btn-secondary px-3 py-1.5 text-xs">Cancel</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add department
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatJoinedDate(isoDate) {
  if (!isoDate) return "—";
  return new Date(isoDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Main page ────────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: "", email: "", password: "", role: "user", department: "" };

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const photoInputRef = useRef(null);
  const { showToast, ToastContainer } = useToast();

  // Filters
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deptFilter, setDeptFilter] = useState("");

  // Confirm deactivate
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

  const fetchDepartments = async () => {
    try {
      const res = await api.get("/users/departments");
      setDepartments(res.data.map((d) => (typeof d === "string" ? d : d.name)));
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    fetchDepartments();
    fetchUsers();
  }, []);

  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview); };
  }, [photoPreview]);

  const allDepartments = useMemo(() => {
    const fromUsers = users.map((u) => u.department).filter(Boolean);
    return [...new Set([...departments, ...fromUsers])].sort();
  }, [departments, users]);

  const handleAddDepartment = async (name) => {
    if (allDepartments.includes(name)) return;
    setDepartments((prev) => [...prev, name].sort());
    try { await api.post("/departments", { name }); } catch { /* non-fatal */ }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append("name", form.name);
      data.append("email", form.email);
      data.append("password", form.password);
      data.append("role", form.role);
      if (form.department) data.append("department", form.department);
      if (photoFile) data.append("profileImage", photoFile);

      await api.post("/users", data, { headers: { "Content-Type": "multipart/form-data" } });

      setForm(EMPTY_FORM);
      handleRemovePhoto();
      setShowForm(false);
      showToast("User created successfully.", "success");
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to create user.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id, name) => setDeleteConfirm({ id, name });

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.delete(`/users/${deleteConfirm.id}`);
      showToast(`"${deleteConfirm.name}" has been deactivated. Historical records are preserved.`, "success");
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to deactivate user.", "error");
    } finally {
      setDeleteConfirm(null);
    }
  };

  // ── Filtered table data — always shows employees only ────────────────────
  const filteredUsers = useMemo(() => {
    let result = users.filter((u) => u.role === "user"); // admins never shown
    const q = search.trim().toLowerCase();
    if (q) result = result.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
    if (deptFilter) result = result.filter((u) => u.department === deptFilter);
    if (dateFrom) result = result.filter((u) => u.createdAt && u.createdAt.slice(0, 10) >= dateFrom);
    if (dateTo) result = result.filter((u) => u.createdAt && u.createdAt.slice(0, 10) <= dateTo);
    return result;
  }, [users, search, deptFilter, dateFrom, dateTo]);

  const hasFilters = search || deptFilter || dateFrom || dateTo;

  // ── Quick stats — employees only ───────────────────────────────────────────
  const employees = users.filter((u) => u.role === "user");
  const totalUsers = employees.length;
  const totalEmployees = totalUsers;
  const faceReady = employees.filter((u) => u.hasFace).length;

  return (
    <PageWrapper
      title="User Management"
      description="Create and manage employee accounts. Track face-registration readiness before attendance begins."
    >
      <ToastContainer />

      {/* ── Deactivate confirm modal ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 pb-4 pt-6">
              <p className="section-label">Deactivate Account</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">{deleteConfirm.name}</h2>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="text-sm text-slate-600">
                This account will be <strong>disabled</strong> and the user will no longer be able to log in.
                All historical attendance records are preserved.
              </p>
              <div className="flex items-center gap-3">
                <button onClick={confirmDelete} className="btn-danger">Deactivate</button>
                <button onClick={() => setDeleteConfirm(null)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create User modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 pb-4 pt-6">
              <div>
                <p className="section-label">New Account</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">Create User</h2>
              </div>
              <button
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); handleRemovePhoto(); }}
                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreate} className="max-h-[75vh] overflow-y-auto px-6 py-5">
              <div className="space-y-4">
                {/* Photo */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Profile photo <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full border-2 border-dashed border-slate-300 bg-slate-50">
                      {photoPreview ? (
                        <img src={photoPreview} alt="Preview" className="h-full w-full rounded-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-300">
                          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <button type="button" onClick={() => photoInputRef.current?.click()} className="btn-secondary text-sm">
                        {photoPreview ? "Change photo" : "Upload photo"}
                      </button>
                      {photoPreview && (
                        <button type="button" onClick={handleRemovePhoto} className="text-left text-xs text-red-500 hover:underline">Remove</button>
                      )}
                    </div>
                  </div>
                  <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handlePhotoChange} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Full name</label>
                    <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Employee name" required />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
                    <input type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="employee@example.com" required />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
                    <input type="password" className="input-field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min. 6 characters" minLength={6} required />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Role</label>
                    <select className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                      <option value="user">Employee</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Department</label>
                  <DepartmentDropdown
                    departments={allDepartments}
                    value={form.department}
                    onChange={(dept) => setForm({ ...form, department: dept })}
                    onAddDepartment={handleAddDepartment}
                  />
                </div>

                <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
                  <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
                    {submitting ? "Creating…" : "Create user"}
                  </button>
                  <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); handleRemovePhoto(); }} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="space-y-5">
        {/* ── Stats strip ── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="card py-4">
            <p className="section-label">Total Accounts</p>
            <p className="metric-value mt-3">{totalUsers}</p>
          </div>
          <div className="card py-4">
            <p className="section-label">Employees</p>
            <p className="metric-value mt-3">{totalEmployees}</p>
          </div>
          <div className="card py-4">
            <p className="section-label">Face Ready</p>
            <p className="metric-value mt-3">{faceReady}</p>
          </div>
        </div>

        {/* ── Control bar ── */}
        <div className="card py-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative min-w-0 flex-1">
              <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 16.65a7.5 7.5 0 0012.15 0z" />
              </svg>
              <input
                type="text"
                className="input-field pl-10"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Department filter */}
            <select
              className="input-field w-auto"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
            >
              <option value="">All departments</option>
              {allDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>

            {/* Created date range */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="input-field w-auto"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="Joined from"
              />
              <span className="text-xs text-slate-400 flex-shrink-0">to</span>
              <input
                type="date"
                className="input-field w-auto"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="Joined to"
              />
            </div>

            {/* Clear filters */}
            {hasFilters && (
              <button
                onClick={() => { setSearch(""); setDeptFilter(""); setDateFrom(""); setDateTo(""); }}
                className="btn-secondary text-sm"
              >
                Clear
              </button>
            )}

            {/* Add User */}
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add User
            </button>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="card overflow-hidden p-0">
          {/* Table header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <p className="section-label">Accounts</p>
              <p className="mt-1 text-sm text-slate-500">
                {filteredUsers.length} {filteredUsers.length === 1 ? "user" : "users"}
                {hasFilters && <span className="text-slate-400"> (filtered from {users.length} total)</span>}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="space-y-0 divide-y divide-slate-100">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <div className="h-9 w-9 animate-pulse rounded-full bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-36 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-48 animate-pulse rounded bg-slate-200" />
                    </div>
                    <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-5 w-24 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-medium text-slate-500">No users match the current filters.</p>
                {hasFilters && (
                  <button
                    onClick={() => { setSearch(""); setRoleFilter("all"); setStatusFilter("all"); }}
                    className="mt-3 text-sm font-semibold text-blue-600 hover:underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Face</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Joined</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => (
                    <tr key={user._id} className="transition-colors hover:bg-slate-50">
                      {/* User (avatar + name) */}
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <UserAvatar user={user} size="md" />
                          <span className="font-medium text-slate-900">{user.name}</span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="max-w-[200px] px-4 py-3.5">
                        <span className="truncate text-slate-500">{user.email}</span>
                      </td>

                      {/* Department */}
                      <td className="px-4 py-3.5">
                        {user.department ? (
                          <span className="status-chip bg-slate-100 text-slate-600">{user.department}</span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3.5">
                        <span className={user.role === "admin" ? "status-chip status-chip-info" : "status-chip status-chip-neutral"}>
                          {user.role === "admin" ? "Admin" : "Employee"}
                        </span>
                      </td>

                      {/* Face status */}
                      <td className="px-4 py-3.5">
                        <span className={user.hasFace ? "status-chip status-chip-success" : "status-chip status-chip-warning"}>
                          {user.hasFace ? "Registered" : "Pending"}
                        </span>
                      </td>

                      {/* Joined date */}
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {formatJoinedDate(user.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        {user.role !== "admin" && !user.isDeleted ? (
                          <button
                            onClick={() => handleDelete(user._id, user.name)}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
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