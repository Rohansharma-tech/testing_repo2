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

export default function AdminLeavesAppealsPage() {
  const [activeTab, setActiveTab] = useState("leaves");
  const [leaves, setLeaves] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  async function fetchData() {
    setLoading(true);
    try {
      if (activeTab === "leaves") {
        const res = await api.get("/leaves/all");
        setLeaves(res.data);
      } else {
        const res = await api.get("/appeals/all");
        setAppeals(res.data);
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(type, id, actionStatus) {
    const reason = window.prompt(`Enter optional reason for ${actionStatus}:`);
    if (reason === null) return; // cancelled

    try {
      if (type === "leaves") {
        await api.put(`/leaves/${id}/status`, { status: actionStatus, adminResponse: reason });
      } else {
        await api.put(`/appeals/${id}/status`, { status: actionStatus, adminResponse: reason });
      }
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update status");
    }
  }

  const dataList = activeTab === "leaves" ? leaves : appeals;

  return (
    <PageWrapper
      title="Leaves & Appeals"
      description="Manage employee leave requests and absentee cutoff appeals."
    >
      <div className="card">
        {/* Tabs */}
        <div className="flex gap-4 border-b border-slate-200 pb-3 mb-6">
          <button
            onClick={() => setActiveTab("leaves")}
            className={`pb-3 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "leaves" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Leave Requests
          </button>
          <button
            onClick={() => setActiveTab("appeals")}
            className={`pb-3 border-b-2 font-medium text-sm transition-colors ${
              activeTab === "appeals" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Cutoff Appeals
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading...</div>
        ) : dataList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">
            No {activeTab} found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataList.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{item.userId?.name}</p>
                      <p className="text-xs text-slate-500">{item.userId?.email}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(`${item.date}T00:00:00`).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate" title={item.reason}>
                      {item.reason}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${getStatusClasses(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.status === "pending" ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAction(activeTab, item._id, "approved")}
                            className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(activeTab, item._id, "rejected")}
                            className="rounded-lg bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Processed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
