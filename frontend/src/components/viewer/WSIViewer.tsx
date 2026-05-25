"use client";

import { useEffect, useRef, useState } from "react";
import OpenSeadragon from "openseadragon";
import { API_URL } from "@/lib/api";

interface WSIViewerProps {
  slideId: string;
}

export default function WSIViewer({ slideId }: WSIViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    setError(null);
    setLoading(true);

    // Pre-check the DZI endpoint before initializing OpenSeadragon
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
          prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.1/images/",
          tileSources: `${API_URL}/api/v1/slides/${slideId}/dzi`,
          animationTime: 0.5,
          blendTime: 0.1,
          constrainDuringPan: true,
          maxZoomPixelRatio: 2,
          minZoomImageRatio: 0.8,
          visibilityRatio: 1,
          zoomPerScroll: 1.2,
          showNavigator: true,
          navigatorPosition: "BOTTOM_RIGHT" as OpenSeadragon.ControlAnchor,
          navigatorSizeRatio: 0.15,
          showZoomControl: true,
          showHomeControl: true,
          showFullPageControl: true,
          showRotationControl: false,
        });

        viewer.addHandler("open", () => setLoading(false));
        viewer.addHandler("open-failed", (event: any) => {
          setLoading(false);
          setError(`Failed to load slide tiles: ${event.message || "unknown error"}`);
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
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [slideId]);

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <h2 className="text-lg font-semibold mb-3">WSI Viewer</h2>
      {error ? (
        <div className="w-full border rounded bg-red-50 border-red-200 p-6 text-center" style={{ minHeight: "200px" }}>
          <p className="text-red-600 font-medium mb-2">WSI Viewer unavailable</p>
          <p className="text-red-500 text-sm">{error}</p>
          <p className="text-gray-400 text-xs mt-3">
            The slide file may not be accessible or OpenSlide may not be installed on the server.
          </p>
        </div>
      ) : (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10 rounded">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-2" />
                <p className="text-sm text-gray-500">Loading slide viewer...</p>
              </div>
            </div>
          )}
          <div
            ref={containerRef}
            className="w-full border rounded"
            style={{ height: "500px" }}
          />
        </div>
      )}
    </div>
  );
}
