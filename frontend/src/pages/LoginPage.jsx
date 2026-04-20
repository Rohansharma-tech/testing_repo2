import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = await login(email, password);
      navigate(user.role === "admin" ? "/admin" : "/dashboard", { replace: true });
    } catch (err) {
      const status = err.response?.status;
      const serverMsg = err.response?.data?.message;

      if (!err.response) {
        // Network error or CORS issue — server unreachable
        setError("Cannot reach the server. Please check your connection or try again shortly.");
      } else if (status === 429) {
        setError(serverMsg || "Too many login attempts. Please wait 15 minutes and try again.");
      } else if (status === 401 || status === 400) {
        // Wrong credentials — show the backend message directly
        setError(serverMsg || "Invalid email or password.");
      } else if (status === 403) {
        setError(serverMsg || "Your account has been deactivated. Contact your administrator.");
      } else {
        setError(serverMsg || "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-[1280px] overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-between border-b border-slate-200 bg-slate-950 px-8 py-10 text-white lg:border-b-0 lg:border-r lg:px-12 lg:py-14">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-sm font-semibold">
              AS
            </div>
            <p className="mt-10 text-sm font-semibold uppercase tracking-[0.25em] text-slate-300">
              Secure Attendance
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight">
              Location-based attendance with face verification and audit-ready status tracking.
            </h1>
            <p className="mt-6 max-w-lg text-sm leading-7 text-slate-300">
              Employees can only submit attendance from the approved geofence, while administrators get live status visibility for present, absent, and outside-location attempts.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Validation", value: "Geofence" },
              { label: "Identity", value: "Face Match" },
              { label: "Status Sync", value: "Present and Absent" },
            ].map((item) => (
              <div key={item.label} className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{item.label}</p>
                <p className="mt-2 text-sm font-semibold text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center px-6 py-8 sm:px-10 lg:px-12">
          <div className="mx-auto w-full max-w-md">
            <div>
              <p className="section-label">Access</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Sign in to continue</h2>
              <p className="mt-2 text-sm text-slate-500">
                Use your assigned account to access employee or administrator tools.
              </p>
            </div>

            {error && (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Email address</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Default admin</p>
              <div className="mt-3 space-y-1 text-sm text-slate-700">
                <p>Email: admin@attendance.com</p>
                <p>Password: admin123</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
