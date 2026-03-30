import { useEffect, useState } from "react";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";

function getStatusClasses(status) {
  switch (status) {
    case "approved":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "rejected":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-amber-50 text-amber-700 border-amber-200";
  }
}

export default function LeaveManagementPage() {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ date: "", reason: "" });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    fetchLeaves();
  }, []);

  async function fetchLeaves() {
    try {
      const res = await api.get("/leaves/my");
      setLeaves(res.data);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await api.post("/leaves", formData);
      setSuccess("Leave request submitted successfully.");
      setFormData({ date: "", reason: "" });
      fetchLeaves(); // refresh
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit leave request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageWrapper
      title="Leave Management"
      description="Apply for leaves and track the status of your existing requests."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Form Section */}
        <div className="lg:col-span-1">
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-900">Apply for Leave</h2>
            <p className="mt-1 text-sm text-slate-500 mb-4">Submit a new leave application.</p>

            {error && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Date</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="mt-1 block w-full rounded-xl border-slate-300 py-2.5 px-3 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Reason</label>
                <textarea
                  required
                  rows={3}
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  className="mt-1 block w-full rounded-xl border-slate-300 py-2.5 px-3 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Explain your reason for leave..."
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full justify-center"
              >
                {isSubmitting ? "Submitting..." : "Submit Leave Request"}
              </button>
            </form>
          </div>
        </div>

        {/* List Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">My Leave Requests</h2>
            {loading ? (
              <div className="text-sm text-slate-500">Loading...</div>
            ) : leaves.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                You haven't applied for any leaves yet.
              </div>
            ) : (
              <div className="space-y-3">
                {leaves.map((leave) => (
                  <div key={leave._id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {new Date(`${leave.date}T00:00:00`).toLocaleDateString("en-IN", {
                            weekday: "short", day: "numeric", month: "long", year: "numeric",
                          })}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">{leave.reason}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider ${getStatusClasses(leave.status)}`}>
                        {leave.status}
                      </span>
                    </div>

                    {/* Admin note */}
                    {leave.adminResponse && (
                      <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 border border-slate-100">
                        <span className="font-semibold text-slate-900 text-xs uppercase tracking-wider">Admin Note:</span> {leave.adminResponse}
                      </div>
                    )}

                    {/* Guidance for rejected leaves */}
                    {leave.status === "rejected" && (
                      <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        </svg>
                        <span>
                          Your leave was <strong>rejected</strong>. You must{" "}
                          <strong>mark attendance manually</strong> for this date. If you don't, the system
                          will mark you absent at cutoff time.
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
