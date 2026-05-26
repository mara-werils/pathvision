"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { API_URL } from "@/lib/api";
import type { InferenceJob, PatchPrediction } from "@/lib/types";
import HeatmapOverlay from "@/components/viewer/HeatmapOverlay";
import ReportPanel from "@/components/inference/ReportPanel";

export default function InferenceResultPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<InferenceJob | null>(null);
  const [predictions, setPredictions] = useState<PatchPrediction[]>([]);
  const [activeTab, setActiveTab] = useState<"results" | "report">("results");

  useEffect(() => {
    const poll = async () => {
      const res = await fetch(`${API_URL}/api/v1/inference/${id}`);
      const data = await res.json();
      setJob(data);
      if (data.status === "complete") {
        const pRes = await fetch(`${API_URL}/api/v1/inference/${id}/predictions?limit=100`);
        const pData = await pRes.json();
        setPredictions(pData);
      } else if (data.status !== "error") {
        setTimeout(poll, 2000);
      }
    };
    poll();
  }, [id]);

  if (!job) return <p className="p-6">Loading...</p>;

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <h1 className="text-2xl font-bold">Inference Results</h1>
        <div className="flex items-center gap-3">
          {job.status === "complete" && (
            <>
              <a
                href={`${API_URL}/api/v1/inference/${id}/export/csv`}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" /></svg>
                Export CSV
              </a>
              <a
                href={`${API_URL}/api/v1/inference/${id}/export/pdf`}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" /></svg>
                Export PDF
              </a>
            </>
          )}
          <span
            className={`px-3 py-1 text-sm rounded-full ${
              job.status === "complete"
                ? "bg-green-100 text-green-700"
                : job.status === "error"
                ? "bg-red-100 text-red-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {job.status}
          </span>
        </div>
      </div>

      {job.status === "running" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
          <p className="text-yellow-800">
            Processing: {job.progress_current}/{job.progress_total} patches
          </p>
          <div className="w-full bg-yellow-200 rounded-full h-2 mt-2">
            <div
              className="bg-yellow-500 h-2 rounded-full transition-all"
              style={{
                width: `${job.progress_total ? (job.progress_current / job.progress_total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Tab switcher */}
      {job.status === "complete" && (
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab("results")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "results"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Results
          </button>
          <button
            onClick={() => setActiveTab("report")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "report"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            AI Report
          </button>
        </div>
      )}

      {/* Results tab */}
      {activeTab === "results" && (
        <>
          {/* Heatmap Overlay */}
          {job.status === "complete" && (
            <div className="mb-6">
              <HeatmapOverlay jobId={id} slideId={job.slide_id} />
            </div>
          )}

          {/* Summary */}
          {job.summary && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold mb-3">Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Total Patches</p>
                  <p className="text-2xl font-bold">{job.summary.total_patches}</p>
                </div>
                {job.summary.class_distribution &&
                  Object.entries(job.summary.class_distribution).map(([name, count]) => (
                    <div key={name} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">{name}</p>
                      <p className="text-2xl font-bold">{count}</p>
                      <p className="text-xs text-gray-400">
                        {job.summary!.total_patches
                          ? `${((count / job.summary!.total_patches!) * 100).toFixed(1)}%`
                          : ""}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Predictions table */}
          {predictions.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-3">
                Patch Predictions (first {predictions.length})
              </h2>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2">Patch ID</th>
                    <th className="text-left px-3 py-2">Prediction</th>
                    <th className="text-left px-3 py-2">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {predictions.map((p) => {
                    const conf = Math.max(...p.probabilities);
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs">{p.patch_id.slice(0, 12)}...</td>
                        <td className="px-3 py-2">
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full ${
                              p.predicted_label === "tumor"
                                ? "bg-red-100 text-red-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {p.predicted_label}
                          </span>
                        </td>
                        <td className="px-3 py-2">{(conf * 100).toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* AI Report tab */}
      {activeTab === "report" && job.status === "complete" && (
        <ReportPanel jobId={id} />
      )}
    </div>
  );
}
