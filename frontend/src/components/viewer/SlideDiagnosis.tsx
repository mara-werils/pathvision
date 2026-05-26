"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

type AttentionPatch = {
  patch_id: string;
  x: number;
  y: number;
  attention_weight: number;
  predicted_label: string;
};

type SpatialSummary = {
  tumor_clusters: number;
  largest_cluster_area_mm2: number;
};

type SlideDiagnosisData = {
  slide_id: string;
  diagnosis: string;
  confidence: number;
  class_probabilities: Record<string, number>;
  total_patches: number;
  tumor_patches: number;
  tumor_percentage: number;
  top_attention_patches: AttentionPatch[];
  spatial_summary: SpatialSummary;
};

function confidenceColor(confidence: number): {
  bg: string;
  text: string;
  ring: string;
  bar: string;
} {
  if (confidence < 0.3) {
    return {
      bg: "bg-green-50",
      text: "text-green-700",
      ring: "ring-green-200",
      bar: "bg-green-500",
    };
  }
  if (confidence < 0.7) {
    return {
      bg: "bg-amber-50",
      text: "text-amber-700",
      ring: "ring-amber-200",
      bar: "bg-amber-500",
    };
  }
  return {
    bg: "bg-red-50",
    text: "text-red-700",
    ring: "ring-red-200",
    bar: "bg-red-500",
  };
}

export default function SlideDiagnosis({ jobId }: { jobId: string }) {
  const [data, setData] = useState<SlideDiagnosisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDiagnosis() {
      try {
        const res = await fetch(
          `${API_URL}/api/v1/inference/${jobId}/slide-diagnosis`
        );
        if (!res.ok) {
          if (res.status === 400) {
            setError("Inference job is not complete yet.");
          } else {
            setError("Failed to load slide diagnosis.");
          }
          return;
        }
        const json = await res.json();
        setData(json);
      } catch {
        setError("Failed to load slide diagnosis.");
      } finally {
        setLoading(false);
      }
    }
    fetchDiagnosis();
  }, [jobId]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-48 mb-4" />
        <div className="h-20 bg-gray-100 rounded" />
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  // Determine color scheme based on tumor probability
  const tumorProb = data.class_probabilities["tumor"] ?? data.confidence;
  const colors = confidenceColor(tumorProb);

  return (
    <div className={`rounded-lg shadow ring-1 ${colors.ring} ${colors.bg} p-6`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Slide-Level Diagnosis
        </h2>
        <span
          className={`px-3 py-1 text-sm font-medium rounded-full ${colors.bg} ${colors.text} ring-1 ${colors.ring}`}
        >
          {data.diagnosis}
        </span>
      </div>

      {/* Confidence + tumor percentage */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {/* Confidence circle */}
        <div className="flex flex-col items-center justify-center bg-white rounded-lg p-4 shadow-sm">
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-gray-200"
                d="M18 2.0845
                   a 15.9155 15.9155 0 0 1 0 31.831
                   a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className={colors.text}
                d="M18 2.0845
                   a 15.9155 15.9155 0 0 1 0 31.831
                   a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${data.confidence * 100}, 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-xl font-bold ${colors.text}`}>
                {(data.confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Confidence</p>
        </div>

        {/* Class probabilities */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-2">Class Probabilities</p>
          <div className="space-y-2">
            {Object.entries(data.class_probabilities).map(([cls, prob]) => (
              <div key={cls}>
                <div className="flex justify-between text-sm mb-0.5">
                  <span className="capitalize text-gray-700">{cls}</span>
                  <span className="font-medium text-gray-900">
                    {(prob * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${
                      cls.toLowerCase() === "tumor"
                        ? "bg-red-500"
                        : "bg-green-500"
                    }`}
                    style={{ width: `${prob * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tumor patch stats */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-xs text-gray-500 mb-2">Patch Distribution</p>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-0.5">
                <span className="text-gray-700">Tumor patches</span>
                <span className="font-medium">
                  {data.tumor_patches} / {data.total_patches}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${colors.bar}`}
                  style={{ width: `${data.tumor_percentage}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {data.tumor_percentage}% tumor area
              </p>
            </div>
            {data.spatial_summary.tumor_clusters > 0 && (
              <div className="text-sm text-gray-700">
                <p>
                  <span className="font-medium">
                    {data.spatial_summary.tumor_clusters}
                  </span>{" "}
                  tumor region{data.spatial_summary.tumor_clusters !== 1 ? "s" : ""}{" "}
                  detected
                </p>
                <p className="text-xs text-gray-500">
                  Largest region: {data.spatial_summary.largest_cluster_area_mm2} mm
                  <sup>2</sup>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top attention patches */}
      {data.top_attention_patches.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Top Attention Patches
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/60">
                <tr>
                  <th className="text-left px-3 py-1.5 text-xs text-gray-500 font-medium">
                    Patch ID
                  </th>
                  <th className="text-left px-3 py-1.5 text-xs text-gray-500 font-medium">
                    Position
                  </th>
                  <th className="text-left px-3 py-1.5 text-xs text-gray-500 font-medium">
                    Prediction
                  </th>
                  <th className="text-left px-3 py-1.5 text-xs text-gray-500 font-medium">
                    Attention
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.top_attention_patches.map((p) => (
                  <tr key={p.patch_id} className="hover:bg-white/50">
                    <td className="px-3 py-1.5 font-mono text-xs text-gray-600">
                      {p.patch_id.slice(0, 12)}...
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gray-600">
                      ({p.x}, {p.y})
                    </td>
                    <td className="px-3 py-1.5">
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
                    <td className="px-3 py-1.5 text-xs font-medium text-gray-700">
                      {(p.attention_weight * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
