"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

type TopPatch = {
  patch_id: string;
  x: number;
  y: number;
  confidence: number;
};

type Region = {
  id: number;
  label: string;
  patch_count: number;
  area_mm2: number;
  avg_confidence: number;
  centroid: { x: number; y: number };
  boundary: number[][];
  top_patches: TopPatch[];
};

type RegionSummary = {
  total_regions: number;
  total_tumor_area_mm2: number;
  slide_tumor_percentage: number;
};

type RegionsResponse = {
  regions: Region[];
  summary: RegionSummary;
};

function confidenceColor(confidence: number): string {
  if (confidence >= 0.9) return "bg-red-100 text-red-800 border-red-300";
  if (confidence >= 0.7) return "bg-orange-100 text-orange-800 border-orange-300";
  if (confidence >= 0.5) return "bg-yellow-100 text-yellow-800 border-yellow-300";
  return "bg-gray-100 text-gray-700 border-gray-300";
}

function confidenceBadgeColor(confidence: number): string {
  if (confidence >= 0.9) return "bg-red-600";
  if (confidence >= 0.7) return "bg-orange-500";
  if (confidence >= 0.5) return "bg-yellow-500";
  return "bg-gray-400";
}

export default function RegionPanel({ jobId }: { jobId: string }) {
  const [data, setData] = useState<RegionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null);

  useEffect(() => {
    const fetchRegions = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/api/v1/inference/${jobId}/regions`, {
          method: "POST",
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Failed to detect regions: ${body}`);
        }
        const result: RegionsResponse = await res.json();
        setData(result);
      } catch (err: any) {
        setError(err.message || "Failed to load regions");
      } finally {
        setLoading(false);
      }
    };
    fetchRegions();
  }, [jobId]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 text-gray-500">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Detecting tumor regions...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!data || data.regions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-2">Tumor Region Detection</h2>
        <p className="text-sm text-gray-500">No spatially coherent tumor regions detected.</p>
      </div>
    );
  }

  const { regions, summary } = data;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Tumor Region Detection</h2>

      {/* Summary bar */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div>
            <span className="text-gray-500">Regions detected:</span>{" "}
            <span className="font-bold text-gray-900">{summary.total_regions}</span>
          </div>
          <div>
            <span className="text-gray-500">Total tumor area:</span>{" "}
            <span className="font-bold text-gray-900">{summary.total_tumor_area_mm2.toFixed(2)} mm²</span>
          </div>
          <div>
            <span className="text-gray-500">Slide tumor coverage:</span>{" "}
            <span className="font-bold text-gray-900">{summary.slide_tumor_percentage.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Region cards */}
      <div className="grid gap-3">
        {regions.map((region) => (
          <button
            key={region.id}
            onClick={() => setSelectedRegion(selectedRegion === region.id ? null : region.id)}
            className={`w-full text-left border rounded-lg p-4 transition-colors ${
              selectedRegion === region.id
                ? "border-indigo-400 bg-indigo-50"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${confidenceBadgeColor(
                    region.avg_confidence
                  )}`}
                >
                  {region.id}
                </div>
                <div>
                  <p className="font-medium text-gray-900">Region {region.id}</p>
                  <p className="text-xs text-gray-500">
                    Centroid: ({region.centroid.x.toFixed(0)}, {region.centroid.y.toFixed(0)})
                  </p>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded-full border ${confidenceColor(
                  region.avg_confidence
                )}`}
              >
                {(region.avg_confidence * 100).toFixed(1)}% conf
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Area</p>
                <p className="font-semibold">{region.area_mm2.toFixed(2)} mm²</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Patches</p>
                <p className="font-semibold">{region.patch_count}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Avg Confidence</p>
                <p className="font-semibold">{(region.avg_confidence * 100).toFixed(1)}%</p>
              </div>
            </div>

            {/* Expanded detail: top patches */}
            {selectedRegion === region.id && region.top_patches.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs font-medium text-gray-500 mb-2">Top confident patches</p>
                <div className="space-y-1">
                  {region.top_patches.map((patch, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-xs bg-white rounded px-2 py-1 border border-gray-100"
                    >
                      <span className="text-gray-600 font-mono">{patch.patch_id.slice(0, 12)}...</span>
                      <span className="text-gray-500">
                        ({patch.x}, {patch.y})
                      </span>
                      <span className="font-medium">{(patch.confidence * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
