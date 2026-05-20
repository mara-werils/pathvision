"use client";

import { useEffect, useRef } from "react";
import OpenSeadragon from "openseadragon";
import { API_URL } from "@/lib/api";

interface WSIViewerProps {
  slideId: string;
}

export default function WSIViewer({ slideId }: WSIViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);

  useEffect(() => {
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

    viewerRef.current = viewer;

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [slideId]);

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <h2 className="text-lg font-semibold mb-3">WSI Viewer</h2>
      <div
        ref={containerRef}
        className="w-full border rounded"
        style={{ height: "500px" }}
      />
    </div>
  );
}
