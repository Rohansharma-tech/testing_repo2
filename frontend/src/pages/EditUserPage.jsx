// src/pages/EditUserPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";
import { useToast } from "../components/Toast";

// canAdd=true  → shows "+ Add new department" form (HOD role only)
// canAdd=false → read-only existing dept list
function DepartmentDropdown({ departments, value, onChange, canAdd = false }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => {
    if (!canAdd) { setAdding(false); setNewName(""); setNewCode(""); setCodeError(""); }
  }, [canAdd]);
  function handleNameChange(e) {
    const n = e.target.value;
    setNewName(n);
    setNewCode(n.replace(/\s+/g, "").slice(0, 3).toUpperCase());
    setCodeError("");
  }
  function handleCodeChange(e) {
    setNewCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6));
    setCodeError("");
  }
  function handleAdd() {
    const trimName = newName.trim(), trimCode = newCode.trim();
    if (!trimName) return;
    if (!/^[A-Z]{2,6}$/.test(trimCode)) { setCodeError("Code must be 2–6 uppercase letters."); return; }
    onChange(trimName, trimCode, true); // true = new dept
    setNewName(""); setNewCode(""); setAdding(false); setOpen(false); setCodeError("");
  }
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)} className="input-field flex w-full items-center justify-between text-left">
        <span className={value ? "text-slate-900" : "text-slate-400"}>{value || "Select department"}</span>
        <svg className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-2xl border border-slate-200 bg-white shadow-xl">
          <ul className="max-h-48 overflow-y-auto py-1">
            {departments.length === 0 && <li className="px-4 py-3 text-sm text-slate-400">{canAdd ? "No departments. Create below." : "No departments available."}</li>}
            {departments.map(d => {
              const dName = d.name ?? d; const dCode = d.code ?? null;
              return (
                <li key={dName}>
                  <button type="button" onClick={() => { onChange(dName, dCode, false); setOpen(false); }} className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${value === dName ? "font-semibold text-blue-700" : "text-slate-700"}`}>
                    <span>{dName}</span>
                    {dCode && <span className="font-mono text-xs text-slate-400">{dCode}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          {canAdd ? (
            <div className="border-t border-slate-100 p-2">
              {adding ? (
                <div className="space-y-2 p-1">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">New Department</p>
                  <input autoFocus type="text" value={newName} onChange={handleNameChange} onKeyDown={e => { if (e.key === "Escape") { setAdding(false); } }} placeholder="Department name" className="input-field w-full py-1.5 text-sm" />
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <input type="text" value={newCode} onChange={handleCodeChange} placeholder="Code (e.g. CSE)" className={`input-field w-full py-1.5 font-mono text-sm uppercase ${codeError ? "border-rose-400" : ""}`} maxLength={6} />
                      {codeError && <p className="mt-0.5 text-xs text-rose-500">{codeError}</p>}
                    </div>
                    <button type="button" onClick={handleAdd} disabled={!newName.trim() || !newCode.trim()} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40">Add</button>
                    <button type="button" onClick={() => setAdding(false)} className="btn-secondary px-3 py-1.5 text-xs">Cancel</button>
                  </div>
                  <p className="text-xs text-slate-400">Code is used in Employee IDs — e.g. CSE26001.</p>
                </div>
              ) : (
                <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Add new department
                </button>
              )}
            </div>
          ) : (
            <div className="border-t border-slate-100 px-4 py-2.5">
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Only HODs can create new departments
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeading({ title, subtitle }) {
  return (
    <div className="border-b border-slate-100 pb-4">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}

function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}{required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
    </div>
  );
}

export default function EditUserPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast, ToastContainer } = useToast();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const photoInputRef = useRef(null);
  const [departments, setDepartments] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [newDeptPayload, setNewDeptPayload] = useState(null);

  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview); };
  }, [photoPreview]);

  useEffect(() => {
    Promise.all([
      api.get(`/users/${id}`),
      api.get("/departments"),
    ]).then(([userRes, deptRes]) => {
      const u = userRes.data;
      setForm({
        firstName: u.firstName ?? "",
        lastName: u.lastName ?? "",
        dateOfBirth: u.dateOfBirth ? u.dateOfBirth.slice(0, 10) : "",
        gender: u.gender ?? "",
        nationality: u.nationality ?? "",
        mobileNo: u.mobileNo ?? "",
        personalEmail: u.personalEmail ?? "",
        email: u.email ?? "",
        department: u.department ?? "",
        designation: u.designation ?? "",
        location: u.location ?? "",
        employeeType: u.employeeType ?? "",
        dateOfJoin: u.dateOfJoin ? u.dateOfJoin.slice(0, 10) : "",
        role: u.role ?? "user",
        password: "",
        confirmPassword: "",
        employeeId: u.employeeId ?? "",
      });
      setPhotoPreview(u.profileImageUrl || u.profileImage || null);
      setDepartments(deptRes.data); // [{ name, code }]
    }).catch((err) => {
      if (err.response?.status === 404) setNotFound(true);
      else showToast("Failed to load user data.", "error");
    }).finally(() => setLoading(false));
  }, [id]);

  const allDepartments = useMemo(() => departments, [departments]);
  const set = (field) => (e) => { setForm(f => ({ ...f, [field]: e.target.value })); setErrors(e => ({ ...e, [field]: undefined })); };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setPhotoFile(file);
    if (photoPreview && photoPreview.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
  };

  // Roles that are NOT tied to a specific department
  const isDeptFree = form ? ["principal", "admin"].includes(form.role) : false;

  function validate() {
    const errs = {};
    if (!form.firstName.trim()) errs.firstName = "First name is required.";
    if (!form.email.trim()) errs.email = "Employee email is required.";
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = "Enter a valid email.";
    // Department is only required for dept-scoped roles (user, hod)
    if (!isDeptFree && !form.department) errs.department = "Department is required.";
    if (!form.dateOfJoin) errs.dateOfJoin = "Date of join is required.";
    if (form.password && form.password.length < 6) errs.password = "Password must be at least 6 characters.";
    if (form.password && form.confirmPassword !== form.password) errs.confirmPassword = "Passwords do not match.";
    if (form.mobileNo && !/^\d{10}$/.test(form.mobileNo.trim())) errs.mobileNo = "Must be exactly 10 digits.";
    if (form.personalEmail && !/\S+@\S+\.\S+/.test(form.personalEmail)) errs.personalEmail = "Enter a valid email.";
    return errs;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitting(true);
    try {
      const data = new FormData();
      data.append("firstName", form.firstName.trim());
      data.append("lastName", form.lastName.trim());
      if (form.dateOfBirth) data.append("dateOfBirth", form.dateOfBirth);
      if (form.gender) data.append("gender", form.gender);
      if (form.nationality) data.append("nationality", form.nationality.trim());
      if (form.mobileNo) data.append("mobileNo", form.mobileNo.trim());
      if (form.personalEmail) data.append("personalEmail", form.personalEmail.trim());
      data.append("email", form.email.trim());
      data.append("department", form.department);
      if (form.designation) data.append("designation", form.designation.trim());
      if (form.location) data.append("location", form.location.trim());
      if (form.employeeType) data.append("employeeType", form.employeeType);
      data.append("dateOfJoin", form.dateOfJoin);
      data.append("role", form.role);
      // Only send password if explicitly provided
      if (form.password && form.password.trim()) data.append("password", form.password.trim());
      if (photoFile) data.append("profileImage", photoFile);

      await api.put(`/users/${id}`, data, { headers: { "Content-Type": "multipart/form-data" } });
      showToast("Employee updated successfully!", "success");
      setTimeout(() => navigate("/admin/users"), 800);
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to update employee.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <PageWrapper title="Edit Employee">
      <div className="space-y-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="card space-y-4">
            <div className="h-5 w-40 animate-pulse rounded-lg bg-slate-200" />
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2, 3, 4].map(j => <div key={j} className="h-11 animate-pulse rounded-2xl bg-slate-200" />)}
            </div>
          </div>
        ))}
      </div>
    </PageWrapper>
  );

  if (notFound) return (
    <PageWrapper title="Edit Employee">
      <div className="card py-16 text-center">
        <p className="text-lg font-semibold text-slate-700">Employee not found.</p>
        <button onClick={() => navigate("/admin/users")} className="btn-primary mt-4">Back to Users</button>
      </div>
    </PageWrapper>
  );

  return (
    <PageWrapper
      title="Edit Employee"
      description={`Updating profile for ${form.firstName} ${form.lastName}`.trim()}
      actions={
        <button onClick={() => navigate("/admin/users")} className="btn-secondary flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to Users
        </button>
      }
    >
      <ToastContainer />
      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-6">

          {/* Employee ID badge — read-only, immutable */}
          <div className="card flex items-center gap-4 py-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-50">
              <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" /></svg>
            </div>
            <div>
              <p className="section-label">Employee ID</p>
              <p className="mt-1 text-lg font-bold tracking-widest text-slate-900">{form.employeeId || "—"}</p>
            </div>
            <div className="ml-auto">
              <span className="status-chip bg-slate-100 text-slate-500">Immutable</span>
            </div>
          </div>

          {/* Profile Photo */}
          <div className="card">
            <SectionHeading title="Profile Photo" subtitle="Optional — JPEG, PNG, WEBP or GIF, max 5 MB" />
            <div className="mt-4 flex items-center gap-5">
              <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-300">
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
                  </div>
                )}
              </div>
              <button type="button" onClick={() => photoInputRef.current?.click()} className="btn-secondary text-sm">
                {photoPreview ? "Change photo" : "Upload photo"}
              </button>
            </div>
            <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handlePhotoChange} />
          </div>

          {/* Section 1: Personal */}
          <div className="card space-y-5">
            <SectionHeading title="Personal Information" subtitle="Identity and demographic details" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First Name" required error={errors.firstName}>
                <input className={`input-field ${errors.firstName ? "border-rose-400" : ""}`} value={form.firstName} onChange={set("firstName")} placeholder="e.g. Rahul" />
              </Field>
              <Field label="Last Name" error={errors.lastName}>
                <input className="input-field" value={form.lastName} onChange={set("lastName")} placeholder="e.g. Sharma" />
              </Field>
              <Field label="Date of Birth">
                <input type="date" className="input-field" value={form.dateOfBirth} onChange={set("dateOfBirth")} />
              </Field>
              <Field label="Gender">
                <select className="input-field" value={form.gender} onChange={set("gender")}>
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Nationality">
                <input className="input-field" value={form.nationality} onChange={set("nationality")} placeholder="e.g. Indian" />
              </Field>
            </div>
          </div>

          {/* Section 2: Contact */}
          <div className="card space-y-5">
            <SectionHeading title="Contact Details" subtitle="How to reach this employee" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mobile Number" error={errors.mobileNo}>
                <input type="tel" className={`input-field ${errors.mobileNo ? "border-rose-400" : ""}`} value={form.mobileNo} onChange={set("mobileNo")} placeholder="10-digit mobile number" maxLength={10} />
              </Field>
              <Field label="Personal Email" error={errors.personalEmail}>
                <input type="email" className={`input-field ${errors.personalEmail ? "border-rose-400" : ""}`} value={form.personalEmail} onChange={set("personalEmail")} placeholder="personal@gmail.com" />
              </Field>
              <Field label="Employee Email" required error={errors.email}>
                <input type="email" className={`input-field ${errors.email ? "border-rose-400" : ""}`} value={form.email} onChange={set("email")} placeholder="employee@company.com" />
              </Field>
            </div>
          </div>

          {/* Section 3: Employment */}
          <div className="card space-y-5">
            <SectionHeading title="Employment Details" subtitle="Role, department, and workplace information" />
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Department — hidden for cross-departmental roles (principal, admin) */}
              {!isDeptFree && (
                <Field label="Department" required error={errors.department}>
                  <DepartmentDropdown
                    departments={allDepartments}
                    value={form.department}
                    onChange={(dName, dCode, isNew) => {
                      setForm(f => ({ ...f, department: dName }));
                      setErrors(e => ({ ...e, department: undefined }));
                      if (isNew) {
                        setDepartments(prev => [...prev, { name: dName, code: dCode }]);
                        setNewDeptPayload({ name: dName, code: dCode });
                      } else {
                        setNewDeptPayload(null);
                      }
                    }}
                    canAdd={form.role === "hod"}
                  />
                  {errors.department && <p className="mt-1 text-xs text-rose-500">{errors.department}</p>}
                </Field>
              )}
              <Field label="Designation">
                <input className="input-field" value={form.designation} onChange={set("designation")} placeholder="e.g. Software Engineer" />
              </Field>
              <Field label="Location / Branch">
                <input className="input-field" value={form.location} onChange={set("location")} placeholder="e.g. Mumbai" />
              </Field>
              <Field label="Employee Type">
                <select className="input-field" value={form.employeeType} onChange={set("employeeType")}>
                  <option value="">Select type</option>
                  <option value="Full-Time">Full-Time</option>
                  <option value="Part-Time">Part-Time</option>
                  <option value="Contract">Contract</option>
                  <option value="Intern">Intern</option>
                </select>
              </Field>
              <Field label="Date of Join" required error={errors.dateOfJoin}>
                <input type="date" className={`input-field ${errors.dateOfJoin ? "border-rose-400" : ""}`} value={form.dateOfJoin} onChange={set("dateOfJoin")} />
              </Field>
              <Field label="System Role">
                <select
                  className="input-field"
                  value={form.role}
                  onChange={(e) => {
                    const newRole = e.target.value;
                    setForm(f => ({
                      ...f,
                      role: newRole,
                      // Clear department for cross-departmental roles
                      ...["principal", "admin"].includes(newRole) ? { department: "" } : {},
                    }));
                    setErrors(prev => ({ ...prev, role: undefined, department: undefined }));
                  }}
                >
                  <option value="user">Employee</option>
                  <option value="hod">HOD (Head of Department)</option>
                  <option value="principal">Principal</option>
                  <option value="admin">Administrator</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Section 4: Password (optional on edit) */}
          <div className="card space-y-5">
            <SectionHeading title="Change Password" subtitle="Leave both fields blank to keep the current password" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="New Password" error={errors.password}>
                <input type="password" className={`input-field ${errors.password ? "border-rose-400" : ""}`} value={form.password} onChange={set("password")} placeholder="Leave blank to keep current" />
              </Field>
              <Field label="Confirm New Password" error={errors.confirmPassword}>
                <input type="password" className={`input-field ${errors.confirmPassword ? "border-rose-400" : ""}`} value={form.confirmPassword} onChange={set("confirmPassword")} placeholder="Re-enter new password" />
              </Field>
            </div>
          </div>

          {/* Submit bar */}
          <div className="card flex items-center justify-between py-4">
            <p className="text-sm text-slate-500">Fields marked <span className="text-rose-500">*</span> are required.</p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => navigate("/admin/users")} className="btn-secondary" disabled={submitting}>Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? (
                  <><svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>Saving…</>
                ) : "Save Changes"}
              </button>
            </div>
          </div>

        </div>
      </form>
    </PageWrapper>
  );
}
