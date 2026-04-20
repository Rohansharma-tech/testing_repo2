// src/pages/ProfilePage.jsx
// Self-service profile edit for HOD, Principal, and Employee.
// Uses the logged-in user's own ID — backend enforces field restrictions.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";

function Field({ label, required, error, children, locked }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}{required && <span className="ml-1 text-rose-500">*</span>}
        {locked && <span className="ml-2 text-xs text-slate-400 font-normal">(locked)</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-500">{error}</p>}
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

const ROLE_LABELS = {
  admin: "Administrator",
  hod: "Head of Department",
  principal: "Principal",
  user: "Employee",
};

const ROLE_HOME = {
  admin: "/admin",
  hod: "/hod/leaves",
  principal: "/principal/leaves",
  user: "/dashboard",
};

export default function ProfilePage() {
  const { user: authUser } = useAuth();
  const navigate = useNavigate();
  const { showToast, ToastContainer } = useToast();

  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const photoInputRef = useRef(null);

  const home = ROLE_HOME[authUser?.role] ?? "/dashboard";

  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview); };
  }, [photoPreview]);

  useEffect(() => {
    if (!authUser?.id) return;
    api.get(`/users/${authUser.id}`)
      .then(res => {
        const u = res.data;
        setForm({
          firstName:    u.firstName ?? "",
          lastName:     u.lastName ?? "",
          dateOfBirth:  u.dateOfBirth ? u.dateOfBirth.slice(0, 10) : "",
          gender:       u.gender ?? "",
          nationality:  u.nationality ?? "",
          mobileNo:     u.mobileNo ?? "",
          personalEmail: u.personalEmail ?? "",
          designation:  u.designation ?? "",
          location:     u.location ?? "",
          password:     "",
          confirmPassword: "",
          // Read-only display
          email:        u.email ?? "",
          employeeId:   u.employeeId ?? "",
          role:         u.role ?? "",
          department:   u.department ?? "",
        });
        setPhotoPreview(u.profileImageUrl || null);
      })
      .catch(() => showToast("Failed to load your profile.", "error"))
      .finally(() => setLoading(false));
  }, [authUser]);

  const set = field => e => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  };

  const handlePhotoChange = e => {
    const file = e.target.files?.[0]; if (!file) return;
    setPhotoFile(file);
    if (photoPreview?.startsWith("blob:")) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
  };

  function validate() {
    const errs = {};
    if (!form.firstName.trim()) errs.firstName = "First name is required.";
    if (form.password && form.password.length < 6) errs.password = "Password must be at least 6 characters.";
    if (form.password && form.confirmPassword !== form.password) errs.confirmPassword = "Passwords do not match.";
    if (form.mobileNo && !/^\d{10}$/.test(form.mobileNo.trim())) errs.mobileNo = "Must be exactly 10 digits.";
    if (form.personalEmail && !/\S+@\S+\.\S+/.test(form.personalEmail)) errs.personalEmail = "Enter a valid email.";
    return errs;
  }

  const handleSubmit = async e => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSubmitting(true);
    try {
      const userId = authUser.id;
      const data = new FormData();
      data.append("firstName", form.firstName.trim());
      data.append("lastName", form.lastName.trim());
      if (form.dateOfBirth) data.append("dateOfBirth", form.dateOfBirth);
      if (form.gender) data.append("gender", form.gender);
      if (form.nationality) data.append("nationality", form.nationality.trim());
      if (form.mobileNo) data.append("mobileNo", form.mobileNo.trim());
      if (form.personalEmail) data.append("personalEmail", form.personalEmail.trim());
      if (form.designation) data.append("designation", form.designation.trim());
      if (form.location) data.append("location", form.location.trim());
      if (form.password?.trim()) data.append("password", form.password.trim());
      if (photoFile) data.append("profileImage", photoFile);

      await api.put(`/users/${userId}`, data, { headers: { "Content-Type": "multipart/form-data" } });
      showToast("Profile updated successfully!", "success");
      setTimeout(() => navigate(home), 800);
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to update profile.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <PageWrapper title="My Profile">
      <div className="space-y-6">
        {[1, 2].map(i => (
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

  if (!form) return null;

  return (
    <PageWrapper
      title="My Profile"
      description="Update your personal information and contact details."
      actions={
        <button onClick={() => navigate(home)} className="btn-secondary flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
      }
    >
      <ToastContainer />
      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-6">

          {/* Identity badge — read-only */}
          <div className="card flex flex-wrap items-center gap-4 py-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-50">
              <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" /></svg>
            </div>
            <div className="min-w-0">
              <p className="section-label">Employee ID</p>
              <p className="mt-1 text-lg font-bold tracking-widest text-slate-900">{form.employeeId || "—"}</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="status-chip bg-indigo-50 text-indigo-700">{form.department || "—"}</span>
              <span className="status-chip bg-slate-100 text-slate-600">{ROLE_LABELS[form.role] ?? form.role}</span>
              <span className="status-chip bg-slate-50 text-slate-500 text-xs">{form.email}</span>
            </div>
          </div>

          {/* Profile Photo */}
          <div className="card">
            <SectionHeading title="Profile Photo" subtitle="JPEG, PNG, WEBP or GIF — max 5 MB" />
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

          {/* Personal */}
          <div className="card space-y-5">
            <SectionHeading title="Personal Information" subtitle="Your name and demographic details" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First Name" required error={errors.firstName}>
                <input className={`input-field ${errors.firstName ? "border-rose-400" : ""}`} value={form.firstName} onChange={set("firstName")} placeholder="e.g. Rahul" />
              </Field>
              <Field label="Last Name">
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

          {/* Contact */}
          <div className="card space-y-5">
            <SectionHeading title="Contact Details" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mobile Number" error={errors.mobileNo}>
                <input type="tel" className={`input-field ${errors.mobileNo ? "border-rose-400" : ""}`} value={form.mobileNo} onChange={set("mobileNo")} placeholder="10-digit mobile" maxLength={10} />
              </Field>
              <Field label="Personal Email" error={errors.personalEmail}>
                <input type="email" className={`input-field ${errors.personalEmail ? "border-rose-400" : ""}`} value={form.personalEmail} onChange={set("personalEmail")} placeholder="personal@gmail.com" />
              </Field>
              <Field label="Designation">
                <input className="input-field" value={form.designation} onChange={set("designation")} placeholder="e.g. Software Engineer" />
              </Field>
              <Field label="Location / Branch">
                <input className="input-field" value={form.location} onChange={set("location")} placeholder="e.g. Mumbai" />
              </Field>
            </div>
          </div>

          {/* Password */}
          <div className="card space-y-5">
            <SectionHeading title="Change Password" subtitle="Leave both blank to keep your current password" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="New Password" error={errors.password}>
                <input type="password" className={`input-field ${errors.password ? "border-rose-400" : ""}`} value={form.password} onChange={set("password")} placeholder="Leave blank to keep current" />
              </Field>
              <Field label="Confirm New Password" error={errors.confirmPassword}>
                <input type="password" className={`input-field ${errors.confirmPassword ? "border-rose-400" : ""}`} value={form.confirmPassword} onChange={set("confirmPassword")} placeholder="Re-enter new password" />
              </Field>
            </div>
          </div>

          {/* Submit */}
          <div className="card flex items-center justify-between py-4">
            <p className="text-sm text-slate-500">Fields marked <span className="text-rose-500">*</span> are required.</p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => navigate(home)} className="btn-secondary" disabled={submitting}>Cancel</button>
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
