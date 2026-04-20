// src/pages/CreateUserPage.jsx
// Full-page employee creation form — replaces the old modal popup.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";
import { useToast } from "../components/Toast";

// ── Department dropdown ───────────────────────────────────────────────────────
// canAdd=true  → shows "+ Add new department" form with name + code inputs (HOD only)
// canAdd=false → read-only list from existing departments only

function DepartmentDropdown({ departments, value, onChange, onAddDepartment, canAdd = false }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handleOutsideClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // When role switches away from HOD, reset the add-form
  useEffect(() => {
    if (!canAdd) { setAdding(false); setNewName(""); setNewCode(""); setCodeError(""); }
  }, [canAdd]);

  function handleNameChange(e) {
    const n = e.target.value;
    setNewName(n);
    // Auto-suggest code from first 3 chars
    setNewCode(n.replace(/\s+/g, "").slice(0, 3).toUpperCase());
    setCodeError("");
  }

  function handleCodeChange(e) {
    const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
    setNewCode(v);
    setCodeError("");
  }

  function handleAdd() {
    const trimName = newName.trim();
    const trimCode = newCode.trim();
    if (!trimName) return;
    if (!/^[A-Z]{2,6}$/.test(trimCode)) {
      setCodeError("Code must be 2–6 uppercase letters (e.g. CSE, ITE).");
      return;
    }
    onAddDepartment(trimName, trimCode);
    onChange(trimName);
    setNewName(""); setNewCode(""); setAdding(false); setOpen(false); setCodeError("");
  }

  function cancelAdd() { setAdding(false); setNewName(""); setNewCode(""); setCodeError(""); }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="input-field flex w-full items-center justify-between text-left"
      >
        <span className={value ? "text-slate-900" : "text-slate-400"}>
          {value || "Select department"}
        </span>
        <svg className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-2xl border border-slate-200 bg-white shadow-xl">
          {/* Existing departments list */}
          <ul className="max-h-48 overflow-y-auto py-1">
            {departments.length === 0 && (
              <li className="px-4 py-3 text-sm text-slate-400">
                {canAdd ? "No departments yet. Create the first one below." : "No departments available."}
              </li>
            )}
            {departments.map(dept => {
              const deptName = dept.name ?? dept;
              const deptCode = dept.code ?? null;
              return (
                <li key={deptName}>
                  <button
                    type="button"
                    onClick={() => { onChange(deptName); setOpen(false); }}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${value === deptName ? "font-semibold text-blue-700" : "text-slate-700"}`}
                  >
                    <span>{deptName}</span>
                    {deptCode && <span className="font-mono text-xs text-slate-400">{deptCode}</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Footer — conditional on canAdd */}
          {canAdd ? (
            <div className="border-t border-slate-100 p-2">
              {adding ? (
                <div className="space-y-2 p-1">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">New Department</p>
                  <input
                    autoFocus
                    type="text"
                    value={newName}
                    onChange={handleNameChange}
                    onKeyDown={e => { if (e.key === "Escape") cancelAdd(); }}
                    placeholder="Department name (e.g. Computer Science)"
                    className="input-field w-full py-1.5 text-sm"
                  />
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={newCode}
                        onChange={handleCodeChange}
                        placeholder="Code (e.g. CSE)"
                        className={`input-field w-full py-1.5 font-mono text-sm uppercase tracking-wider ${codeError ? "border-rose-400" : ""}`}
                        maxLength={6}
                      />
                      {codeError && <p className="mt-0.5 text-xs text-rose-500">{codeError}</p>}
                    </div>
                    <button type="button" onClick={handleAdd} disabled={!newName.trim() || !newCode.trim()} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-40">Add</button>
                    <button type="button" onClick={cancelAdd} className="btn-secondary px-3 py-1.5 text-xs">Cancel</button>
                  </div>
                  <p className="text-xs text-slate-400">Code is used in Employee IDs — e.g. CSE26001.</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
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


// ── Section header ────────────────────────────────────────────────────────────

function SectionHeading({ icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Form field ────────────────────────────────────────────────────────────────

function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const EMPTY = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  nationality: "",
  mobileNo: "",
  personalEmail: "",
  email: "",
  department: "",
  designation: "",
  location: "",
  employeeType: "",
  dateOfJoin: "",
  role: "user",
  password: "",
  confirmPassword: "",
};

export default function CreateUserPage() {
  const navigate = useNavigate();
  const { showToast, ToastContainer } = useToast();

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const photoInputRef = useRef(null);
  const [departments, setDepartments] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview); };
  }, [photoPreview]);

  useEffect(() => {
    api.get("/departments")
      .then((res) => setDepartments(res.data)) // now returns [{ name, code }]
      .catch(() => {});
  }, []);

  const allDepartments = useMemo(() => departments, [departments]);

  // Track if a NEW department was typed (HOD-only flow)
  const [newDeptPayload, setNewDeptPayload] = useState(null); // { name, code } | null

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((err) => ({ ...err, [field]: undefined }));
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleAddDepartment = (name, code) => {
    setDepartments((prev) => [...prev, { name, code }]);
    setNewDeptPayload({ name, code }); // remember for submit
  };

  // When dept is changed to an existing one, clear any pending new-dept payload
  function handleDeptChange(deptName) {
    setForm((f) => ({ ...f, department: deptName }));
    setErrors((e) => ({ ...e, department: undefined }));
    // If user picks an existing dept after typing a new one, clear the new-dept payload
    const isExisting = departments.some(d => (d.name ?? d) === deptName && !newDeptPayload?.name !== deptName);
    if (newDeptPayload && newDeptPayload.name !== deptName) setNewDeptPayload(null);
  }

  // ── Client-side validation ─────────────────────────────────────────────────
  function validate() {
    const errs = {};
    if (!form.firstName.trim()) errs.firstName = "First name is required.";
    if (!form.email.trim()) errs.email = "Employee email is required.";
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = "Enter a valid email address.";
    // Principal is institution-wide — no department required
    if (form.role !== "principal" && !form.department) errs.department = "Department is required.";
    if (!form.dateOfJoin) errs.dateOfJoin = "Date of join is required.";
    if (!form.password) errs.password = "Password is required.";
    else if (form.password.length < 6) errs.password = "Password must be at least 6 characters.";
    if (form.confirmPassword !== form.password) errs.confirmPassword = "Passwords do not match.";
    if (form.mobileNo && !/^\d{10}$/.test(form.mobileNo.trim()))
      errs.mobileNo = "Mobile number must be exactly 10 digits.";
    if (form.personalEmail && !/\S+@\S+\.\S+/.test(form.personalEmail))
      errs.personalEmail = "Enter a valid email address.";
    return errs;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      const data = new FormData();
      // Personal
      data.append("firstName", form.firstName.trim());
      data.append("lastName", form.lastName.trim());
      if (form.dateOfBirth) data.append("dateOfBirth", form.dateOfBirth);
      if (form.gender) data.append("gender", form.gender);
      if (form.nationality) data.append("nationality", form.nationality.trim());
      // Contact
      if (form.mobileNo) data.append("mobileNo", form.mobileNo.trim());
      if (form.personalEmail) data.append("personalEmail", form.personalEmail.trim());
      data.append("email", form.email.trim());
      // Employment
      if (form.role === "principal") {
        // Principal has no department — backend handles this
      } else if (form.role === "hod" && newDeptPayload) {
        data.append("newDepartmentName", newDeptPayload.name);
        data.append("newDepartmentCode", newDeptPayload.code);
      } else {
        data.append("department", form.department);
      }
      if (form.designation) data.append("designation", form.designation.trim());
      if (form.location) data.append("location", form.location.trim());
      if (form.employeeType) data.append("employeeType", form.employeeType);
      data.append("dateOfJoin", form.dateOfJoin);
      data.append("role", form.role);
      // Account
      data.append("password", form.password);
      // Photo
      if (photoFile) data.append("profileImage", photoFile);

      await api.post("/users", data, { headers: { "Content-Type": "multipart/form-data" } });

      showToast("Employee created successfully!", "success");
      setTimeout(() => navigate("/admin/users"), 800);
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to create employee.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageWrapper
      title="Add Employee"
      description="Fill in the employee details below. The Employee ID will be auto-generated after submission."
      actions={
        <button onClick={() => navigate("/admin/users")} className="btn-secondary flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Users
        </button>
      }
    >
      <ToastContainer />

      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-6">

          {/* ── Employee ID badge ── */}
          <div className="card flex items-center gap-4 py-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-50">
              <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
              </svg>
            </div>
            <div>
              <p className="section-label">Employee ID</p>
              <p className="mt-1 text-sm font-medium text-slate-500 italic">
                Will be auto-generated by the system after creation
              </p>
            </div>
            <div className="ml-auto">
              <span className="status-chip bg-indigo-50 text-indigo-600">Auto-assigned</span>
            </div>
          </div>

          {/* ── Profile Photo ── */}
          <div className="card">
            <SectionHeading
              title="Profile Photo"
              subtitle="Optional — JPEG, PNG, WEBP, or GIF, max 5 MB"
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              }
            />
            <div className="mt-4 flex items-center gap-5">
              <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">
                {photoPreview ? (
                  <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-300">
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => photoInputRef.current?.click()} className="btn-secondary text-sm">
                  {photoPreview ? "Change photo" : "Upload photo"}
                </button>
                {photoPreview && (
                  <button
                    type="button"
                    onClick={() => { setPhotoFile(null); URL.revokeObjectURL(photoPreview); setPhotoPreview(null); if (photoInputRef.current) photoInputRef.current.value = ""; }}
                    className="text-left text-xs text-rose-500 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handlePhotoChange} />
          </div>

          {/* ── Section 1: Personal Information ── */}
          <div className="card space-y-5">
            <SectionHeading
              title="Personal Information"
              subtitle="Identity and demographic details"
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First Name" required error={errors.firstName}>
                <input id="firstName" className={`input-field ${errors.firstName ? "border-rose-400" : ""}`} value={form.firstName} onChange={set("firstName")} placeholder="e.g. Rahul" />
              </Field>
              <Field label="Last Name" error={errors.lastName}>
                <input id="lastName" className="input-field" value={form.lastName} onChange={set("lastName")} placeholder="e.g. Sharma" />
              </Field>
              <Field label="Date of Birth" error={errors.dateOfBirth}>
                <input id="dateOfBirth" type="date" className="input-field" value={form.dateOfBirth} onChange={set("dateOfBirth")} />
              </Field>
              <Field label="Gender" error={errors.gender}>
                <select id="gender" className="input-field" value={form.gender} onChange={set("gender")}>
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Nationality" error={errors.nationality}>
                <input id="nationality" className="input-field" value={form.nationality} onChange={set("nationality")} placeholder="e.g. Indian" />
              </Field>
            </div>
          </div>

          {/* ── Section 2: Contact Details ── */}
          <div className="card space-y-5">
            <SectionHeading
              title="Contact Details"
              subtitle="How to reach this employee"
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mobile Number" error={errors.mobileNo}>
                <input id="mobileNo" type="tel" className={`input-field ${errors.mobileNo ? "border-rose-400" : ""}`} value={form.mobileNo} onChange={set("mobileNo")} placeholder="10-digit mobile number" maxLength={10} />
              </Field>
              <Field label="Personal Email" error={errors.personalEmail}>
                <input id="personalEmail" type="email" className={`input-field ${errors.personalEmail ? "border-rose-400" : ""}`} value={form.personalEmail} onChange={set("personalEmail")} placeholder="personal@gmail.com" />
              </Field>
              <Field label="Employee Email" required error={errors.email}>
                <input id="employeeEmail" type="email" className={`input-field ${errors.email ? "border-rose-400" : ""}`} value={form.email} onChange={set("email")} placeholder="employee@company.com" />
              </Field>
            </div>
          </div>

          {/* ── Section 3: Employment Details ── */}
          <div className="card space-y-5">
            <SectionHeading
              title="Employment Details"
              subtitle="Role, department, and workplace information"
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
                </svg>
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {form.role === "principal" ? (
                // Principal has no department — institution-wide role
                <div className="col-span-2 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <svg className="h-5 w-5 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="text-sm text-amber-800">
                    <span className="font-semibold">Principal is institution-wide</span> — no department assignment required. The Principal oversees all departments.
                  </p>
                </div>
              ) : (
                <Field label="Department" required error={errors.department}>
                  <DepartmentDropdown
                    departments={allDepartments}
                    value={form.department}
                    onChange={handleDeptChange}
                    onAddDepartment={handleAddDepartment}
                    canAdd={form.role === "hod"}
                  />
                  {errors.department && <p className="mt-1 text-xs text-rose-500">{errors.department}</p>}
                  {form.role === "hod" && newDeptPayload && form.department === newDeptPayload.name && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-blue-600 font-medium">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      New department "{newDeptPayload.name}" ({newDeptPayload.code}) will be created
                    </p>
                  )}
                </Field>
              )}

              <Field label="Designation" error={errors.designation}>
                <input id="designation" className="input-field" value={form.designation} onChange={set("designation")} placeholder="e.g. Software Engineer" />
              </Field>
              <Field label="Location / Branch" error={errors.location}>
                <input id="location" className="input-field" value={form.location} onChange={set("location")} placeholder="e.g. Mumbai" />
              </Field>
              <Field label="Employee Type" error={errors.employeeType}>
                <select id="employeeType" className="input-field" value={form.employeeType} onChange={set("employeeType")}>
                  <option value="">Select type</option>
                  <option value="Full-Time">Full-Time</option>
                  <option value="Part-Time">Part-Time</option>
                  <option value="Contract">Contract</option>
                  <option value="Intern">Intern</option>
                </select>
              </Field>
              <Field label="Date of Join" required error={errors.dateOfJoin}>
                <input id="dateOfJoin" type="date" className={`input-field ${errors.dateOfJoin ? "border-rose-400" : ""}`} value={form.dateOfJoin} onChange={set("dateOfJoin")} />
              </Field>
              <Field label="System Role" error={errors.role}>
                <select id="role" className="input-field" value={form.role} onChange={set("role")}>
                  <option value="user">Employee</option>
                  <option value="hod">HOD (Head of Department)</option>
                  <option value="principal">Principal</option>
                  <option value="admin">Administrator</option>
                </select>
              </Field>
            </div>
          </div>

          {/* ── Section 4: Account Security ── */}
          <div className="card space-y-5">
            <SectionHeading
              title="Account Security"
              subtitle="Login credentials for the employee"
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              }
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Password" required error={errors.password}>
                <input id="password" type="password" className={`input-field ${errors.password ? "border-rose-400" : ""}`} value={form.password} onChange={set("password")} placeholder="Min. 6 characters" minLength={6} />
              </Field>
              <Field label="Confirm Password" required error={errors.confirmPassword}>
                <input id="confirmPassword" type="password" className={`input-field ${errors.confirmPassword ? "border-rose-400" : ""}`} value={form.confirmPassword} onChange={set("confirmPassword")} placeholder="Re-enter password" />
              </Field>
            </div>
          </div>

          {/* ── Submit bar ── */}
          <div className="card flex items-center justify-between py-4">
            <p className="text-sm text-slate-500">
              Fields marked with <span className="text-rose-500">*</span> are required.
            </p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => navigate("/admin/users")} className="btn-secondary" disabled={submitting}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Creating…
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Create Employee
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </PageWrapper>
  );
}
