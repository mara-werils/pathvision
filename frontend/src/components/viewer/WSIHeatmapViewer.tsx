"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import OpenSeadragon from "openseadragon";
import { API_URL } from "@/lib/api";

type HeatmapTab = "classification" | "confidence";

interface WSIHeatmapViewerProps {
  slideId: string;
  jobId: string;
}

export default function WSIHeatmapViewer({ slideId, jobId }: WSIHeatmapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const overlayRef = useRef<OpenSeadragon.TiledImage | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<HeatmapTab>("classification");
  const [opacity, setOpacity] = useState(50);
  const [visible, setVisible] = useState(true);
  const prevOpacityRef = useRef(50);

  const getHeatmapUrl = useCallback(
    (tab: HeatmapTab) =>
      tab === "classification"
        ? `${API_URL}/api/v1/inference/${jobId}/heatmap`
        : `${API_URL}/api/v1/inference/${jobId}/heatmap/confidence`,
    [jobId],
  );

  // Initialize viewer
  useEffect(() => {
    if (!containerRef.current) return;
    setError(null);
    setLoading(true);

    fetch(`${API_URL}/api/v1/slides/${slideId}/dzi`)
      .then((res) => {
        if (!res.ok) {
          return res.text().then((body) => {
            throw new Error(body || `DZI endpoint returned ${res.status}`);
          });
        }
        return res.text();
      })
      .then((xml) => {
        if (!xml || !xml.includes("<Image")) {
          throw new Error("Invalid DZI descriptor received");
        }

        if (!containerRef.current) return;

        const viewer = OpenSeadragon({
          element: containerRef.current,
          prefixUrl:
            "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.1/images/",
          tileSources: `${API_URL}/api/v1/slides/${slideId}/dzi`,
          animationTime: 0.5,
          blendTime: 0.1,
          constrainDuringPan: true,
          maxZoomPixelRatio: 2,
          minZoomImageRatio: 0.8,
          visibilityRatio: 1,
          zoomPerScroll: 1.2,
          showNavigator: true,
          navigatorPosition: "TOP_RIGHT" as OpenSeadragon.ControlAnchor,
          navigatorSizeRatio: 0.15,
          navigatorAutoFade: true,
          navigatorMaintainSizeRatio: true,
          showZoomControl: true,
          showHomeControl: true,
          showFullPageControl: true,
          showRotationControl: false,
        });

        viewer.addHandler("open", () => {
          setLoading(false);

          // Add initial heatmap overlay
          viewer.addSimpleImage({
            url: getHeatmapUrl("classification"),
            x: 0,
            y: 0,
            width: 1,
            opacity: 0.5,
            success: (event: { item: OpenSeadragon.TiledImage }) => {
              overlayRef.current = event.item;
            },
          });
        });

        viewer.addHandler("open-failed", (event: any) => {
          setLoading(false);
          setError(
            `Failed to load slide tiles: ${event.message || "unknown error"}`,
          );
        });

        viewer.addHandler("tile-load-failed", () => {
          // Don't fail completely on single tile errors
        });

        viewerRef.current = viewer;
      })
      .catch((err) => {
        setLoading(false);
        setError(err.message || "Failed to load WSI viewer");
      });

    return () => {
      overlayRef.current = null;
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [slideId, getHeatmapUrl]);

  // Handle tab changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || loading || error) return;

    // Remove existing overlay
    if (overlayRef.current) {
      viewer.world.removeItem(overlayRef.current);
      overlayRef.current = null;
    }

    // Add new overlay with current settings
    viewer.addSimpleImage({
      url: getHeatmapUrl(activeTab),
      x: 0,
      y: 0,
      width: 1,
      opacity: visible ? opacity / 100 : 0,
      success: (event: { item: OpenSeadragon.TiledImage }) => {
        overlayRef.current = event.item;
      },
    });
  }, [activeTab, getHeatmapUrl, loading, error]);

  // Handle opacity changes
  useEffect(() => {
    if (overlayRef.current && visible) {
      overlayRef.current.setOpacity(opacity / 100);
    }
  }, [opacity, visible]);

  // Handle visibility toggle
  useEffect(() => {
    if (!overlayRef.current) return;
    if (visible) {
      overlayRef.current.setOpacity(opacity / 100);
    } else {
      prevOpacityRef.current = opacity;
      overlayRef.current.setOpacity(0);
    }
  }, [visible, opacity]);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-semibold mb-3">WSI Heatmap Viewer</h2>

      {error ? (
        <div
          className="w-full border rounded bg-red-50 border-red-200 p-6 text-center"
          style={{ minHeight: "200px" }}
        >
          <p className="text-red-600 font-medium mb-2">
            WSI Viewer unavailable
          </p>
          <p className="text-red-500 text-sm">{error}</p>
          <p className="text-gray-400 text-xs mt-3">
            The slide file may not be accessible or OpenSlide may not be
            installed on the server.
          </p>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10 rounded">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  Loading slide viewer...
                </p>
              </div>
            </div>
          )}

          <div
            ref={containerRef}
            className="w-full border rounded"
            style={{ height: "500px", position: "relative" }}
          />

          {/* Floating control panel */}
          {!loading && (
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur rounded-lg shadow-lg p-3 z-10 w-64">
              {/* Tabs */}
              <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab("classification")}
                  className={`flex-1 px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeTab === "classification"
                      ? "bg-white text-gray-900 shadow-sm font-medium"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Classification
                </button>
                <button
                  onClick={() => setActiveTab("confidence")}
                  className={`flex-1 px-2 py-1.5 text-xs rounded-md transition-colors ${
                    activeTab === "confidence"
                      ? "bg-white text-gray-900 shadow-sm font-medium"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Confidence
                </button>
              </div>

              {/* Opacity slider */}
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs text-gray-600 whitespace-nowrap">
                  Opacity: {opacity}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              {/* Show/Hide toggle */}
              <button
                onClick={() => setVisible((v) => !v)}
                className={`w-full px-3 py-1 text-xs rounded-full border transition-colors ${
                  visible
                    ? "bg-indigo-100 text-indigo-700 border-indigo-300"
                    : "bg-gray-100 text-gray-500 border-gray-300"
                }`}
              >
                {visible ? "Hide Overlay" : "Show Overlay"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
