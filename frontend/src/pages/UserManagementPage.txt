import { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";
import { useToast } from "../components/Toast";

// ─── Custom department dropdown ───────────────────────────────────────────────
function DepartmentDropdown({ departments, value, onChange, onAddDepartment, placeholder = "Select a department" }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const ref = useRef(null);

  // Close on outside click
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
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input-field flex w-full items-center justify-between text-left"
      >
        <span className={value ? "text-slate-900" : "text-slate-400"}>
          {value || placeholder}
        </span>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-2xl border border-slate-200 bg-white shadow-lg">
          {/* Existing options */}
          <ul className="max-h-48 overflow-y-auto py-1">
            {departments.length === 0 && (
              <li className="px-4 py-3 text-sm text-slate-400">No departments yet. Add one below.</li>
            )}
            {departments.map((dept) => (
              <li key={dept}>
                <button
                  type="button"
                  onClick={() => { onChange(dept); setOpen(false); }}
                  className={`w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${
                    value === dept ? "font-semibold text-blue-700" : "text-slate-700"
                  }`}
                >
                  {dept}
                </button>
              </li>
            ))}
          </ul>

          {/* Divider */}
          <div className="border-t border-slate-100" />

          {/* Add department row */}
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

// ─── Main page ────────────────────────────────────────────────────────────────
export default function UserManagementPage() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user", department: "" });
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [groupByDepartment, setGroupByDepartment] = useState(false);
  const { showToast, ToastContainer } = useToast();

  const fetchUsers = async () => {
    try {
      const res = await api.get("/users");
      setUsers(res.data);
    } catch (err) {
      showToast("Failed to load users.", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await api.get("/users/departments");
      const names = res.data.map((d) => (typeof d === "string" ? d : d.name));
      setDepartments(names);
    } catch {
      // Fallback: derive from users
    }
  };

  useEffect(() => {
    fetchDepartments();
    fetchUsers();
  }, []);

  const allDepartments = useMemo(() => {
    const fromUsers = users.map((u) => u.department).filter(Boolean);
    return [...new Set([...departments, ...fromUsers])].sort();
  }, [departments, users]);

  const handleAddDepartment = async (name) => {
    if (allDepartments.includes(name)) return;
    setDepartments((prev) => [...prev, name].sort());
    try {
      await api.post("/departments", { name });
    } catch {
      // Non-fatal
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/users", form);
      setForm({ name: "", email: "", password: "", role: "user", department: "" });
      setShowForm(false);
      showToast("User created successfully.", "success");
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to create user.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete user "${name}"? This action cannot be undone.`)) return;
    try {
      await api.delete(`/users/${id}`);
      showToast("User deleted successfully.", "success");
      fetchUsers();
    } catch {
      showToast("Failed to delete user.", "error");
    }
  };

  const filteredUsers = useMemo(() => {
    if (departmentFilter === "all") return users;
    if (departmentFilter === "__none__") return users.filter((u) => !u.department);
    return users.filter((u) => u.department === departmentFilter);
  }, [users, departmentFilter]);

  const groupedUsers = useMemo(() => {
    if (!groupByDepartment) return null;
    const map = new Map();
    for (const user of filteredUsers) {
      const key = user.department || "Unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(user);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredUsers, groupByDepartment]);

  const UserCard = ({ user }) => (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{user.name}</p>
            <span className={user.role === "admin" ? "status-chip status-chip-info" : "status-chip status-chip-neutral"}>
              {user.role === "admin" ? "Admin" : "Employee"}
            </span>
            <span className={user.hasFace ? "status-chip status-chip-success" : "status-chip status-chip-warning"}>
              {user.hasFace ? "Face Registered" : "Face Pending"}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">{user.email}</p>
          {user.department && (
            <p className="mt-1 text-xs text-slate-400">
              Dept: <span className="font-medium text-slate-600">{user.department}</span>
            </p>
          )}
        </div>
        {user.role !== "admin" && (
          <button onClick={() => handleDelete(user._id, user.name)} className="btn-danger">Delete</button>
        )}
      </div>
    </div>
  );

  return (
    <PageWrapper
      title="User Management"
      description="Create employee accounts and review face-registration readiness before attendance begins."
      actions={
        <button onClick={() => setShowForm((c) => !c)} className="btn-primary">
          {showForm ? "Close form" : "Create user"}
        </button>
      }
    >
      <ToastContainer />

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        {/* ── Left: stats + form ── */}
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-1">
            <div className="card">
              <p className="section-label">Users</p>
              <p className="metric-value mt-4">{users.length}</p>
              <p className="metric-label">Total accounts</p>
            </div>
            <div className="card">
              <p className="section-label">Employees</p>
              <p className="metric-value mt-4">{users.filter((u) => u.role === "user").length}</p>
              <p className="metric-label">Non-admin users</p>
            </div>
            <div className="card">
              <p className="section-label">Face Ready</p>
              <p className="metric-value mt-4">{users.filter((u) => u.hasFace).length}</p>
              <p className="metric-label">Accounts with face registration</p>
            </div>
          </div>

          {showForm && (
            <div className="card">
              <p className="section-label">Create User</p>
              <form onSubmit={handleCreate} className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Full name</label>
                  <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Employee name" required />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
                  <input type="email" className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="employee@example.com" required />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
                  <input type="password" className="input-field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Minimum 6 characters" minLength={6} required />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Role</label>
                  <select className="input-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="user">Employee</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Department</label>
                  <DepartmentDropdown
                    departments={allDepartments}
                    value={form.department}
                    onChange={(dept) => setForm({ ...form, department: dept })}
                    onAddDepartment={handleAddDepartment}
                  />
                </div>
                <button type="submit" disabled={submitting} className="btn-primary w-full">
                  {submitting ? "Creating..." : "Create user"}
                </button>
              </form>
            </div>
          )}
        </section>

        {/* ── Right: filter + list ── */}
        <section className="card">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="section-label">Accounts</p>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">Current users</h2>
            </div>
            <p className="text-sm text-slate-500">{users.length} total</p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <select
              className="input-field flex-1"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="all">All departments</option>
              {allDepartments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
              <option value="__none__">Unassigned</option>
            </select>

            <button onClick={() => setGroupByDepartment((v) => !v)} className={groupByDepartment ? "btn-primary" : "btn-secondary"}>
              {groupByDepartment ? "Ungroup" : "Group by dept."}
            </button>

            {departmentFilter !== "all" && (
              <button onClick={() => setDepartmentFilter("all")} className="btn-secondary">Reset</button>
            )}
          </div>

          <div className="mt-6 space-y-3">
            {loading ? (
              [1, 2, 3].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                  <div className="mt-3 h-3 w-28 animate-pulse rounded bg-slate-200" />
                </div>
              ))
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">
                No users match the current filter.
              </div>
            ) : groupByDepartment && groupedUsers ? (
              groupedUsers.map(([deptName, deptUsers]) => (
                <div key={deptName}>
                  <div className="mb-2 flex items-center gap-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{deptName}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{deptUsers.length}</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>
                  <div className="space-y-3">
                    {deptUsers.map((user) => <UserCard key={user._id} user={user} />)}
                  </div>
                </div>
              ))
            ) : (
              filteredUsers.map((user) => <UserCard key={user._id} user={user} />)
            )}
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}