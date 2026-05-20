"use client";

import { useState } from "react";
import { API_URL } from "@/lib/api";

type HeatmapTab = "classification" | "confidence";

interface HeatmapOverlayProps {
  jobId: string;
  slideId: string;
}

export default function HeatmapOverlay({ jobId, slideId }: HeatmapOverlayProps) {
  const [opacity, setOpacity] = useState(50);
  const [visible, setVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<HeatmapTab>("classification");

  const thumbnailUrl = `${API_URL}/api/v1/slides/${slideId}/thumbnail`;
  const heatmapUrl =
    activeTab === "classification"
      ? `${API_URL}/api/v1/inference/${jobId}/heatmap`
      : `${API_URL}/api/v1/inference/${jobId}/heatmap/confidence`;

  const tabLabel =
    activeTab === "classification" ? "Classification Heatmap" : "Confidence Map";

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Heatmap Overlay</h2>
        <button
          onClick={() => setVisible((v) => !v)}
          className={`px-3 py-1 text-sm rounded-full border transition-colors ${
            visible
              ? "bg-indigo-100 text-indigo-700 border-indigo-300"
              : "bg-gray-100 text-gray-500 border-gray-300"
          }`}
        >
          {visible ? "Hide Overlay" : "Show Overlay"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab("classification")}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === "classification"
              ? "bg-white text-gray-900 shadow-sm font-medium"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Classification
        </button>
        <button
          onClick={() => setActiveTab("confidence")}
          className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === "confidence"
              ? "bg-white text-gray-900 shadow-sm font-medium"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Confidence
        </button>
      </div>

      {/* Opacity slider */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-600 whitespace-nowrap">
          Opacity: {opacity}%
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={opacity}
          onChange={(e) => setOpacity(Number(e.target.value))}
          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
        />
      </div>

      {/* Viewer with overlay */}
      <div className="relative w-full rounded border overflow-hidden bg-gray-50">
        {/* Slide thumbnail as base layer */}
        <img
          src={thumbnailUrl}
          alt="Slide thumbnail"
          className="w-full block"
          onError={(e) => {
            (e.target as HTMLImageElement).alt = "Thumbnail unavailable";
          }}
        />

        {/* Heatmap overlay on top */}
        {visible && (
          <img
            src={heatmapUrl}
            alt={tabLabel}
            className="absolute inset-0 w-full h-full object-fill pointer-events-none"
            style={{ opacity: opacity / 100 }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
      </div>

      <p className="text-xs text-gray-400 mt-2">
        {activeTab === "classification"
          ? "Green = class 0, Red = class 1. Opacity reflects confidence."
          : "Blue = low probability, Red = high probability of class 1."}
      </p>
    </div>
  );
}
