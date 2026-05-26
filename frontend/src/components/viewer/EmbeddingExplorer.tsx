"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { API_URL } from "@/lib/api";

type ProjectionPoint = {
  patch_id: string;
  x: number;
  y: number;
  label: string | null;
  prediction: string | null;
  confidence: number | null;
  slide_x: number;
  slide_y: number;
};

type ProjectionData = {
  method: string;
  points: ProjectionPoint[];
  explained_variance: number[];
  total_patches: number;
};

type ColorMode = "label" | "prediction";

const LABEL_COLORS: Record<string, string> = {
  tumor: "#dc2626",
  normal: "#16a34a",
  stroma: "#2563eb",
  necrosis: "#9333ea",
  immune: "#ea580c",
};

const DEFAULT_COLOR = "#9ca3af";

function getPointColor(
  point: ProjectionPoint,
  colorMode: ColorMode
): { fill: string; opacity: number } {
  if (colorMode === "label") {
    if (!point.label) return { fill: DEFAULT_COLOR, opacity: 0.5 };
    const color = LABEL_COLORS[point.label.toLowerCase()] || "#6366f1";
    return { fill: color, opacity: 0.85 };
  }
  // prediction mode
  if (!point.prediction) return { fill: DEFAULT_COLOR, opacity: 0.5 };
  const color = LABEL_COLORS[point.prediction.toLowerCase()] || "#6366f1";
  const opacity = point.confidence != null ? 0.3 + point.confidence * 0.6 : 0.7;
  return { fill: color, opacity };
}

const PLOT_WIDTH = 600;
const PLOT_HEIGHT = 400;
const PADDING = 30;

export default function EmbeddingExplorer({ slideId }: { slideId: string }) {
  const [data, setData] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("label");
  const [hoveredPoint, setHoveredPoint] = useState<ProjectionPoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Zoom/pan state
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/api/v1/embeddings/slide/${slideId}/projection?method=pca&n_components=2`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: ProjectionData) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [slideId]);

  // Compute data bounds and scale
  const { scaleX, scaleY, minX, minY } = (() => {
    if (!data || data.points.length === 0)
      return { scaleX: 1, scaleY: 1, minX: 0, minY: 0 };
    const xs = data.points.map((p) => p.x);
    const ys = data.points.map((p) => p.y);
    const mnX = Math.min(...xs);
    const mxX = Math.max(...xs);
    const mnY = Math.min(...ys);
    const mxY = Math.max(...ys);
    const rangeX = mxX - mnX || 1;
    const rangeY = mxY - mnY || 1;
    return {
      scaleX: (PLOT_WIDTH - 2 * PADDING) / rangeX,
      scaleY: (PLOT_HEIGHT - 2 * PADDING) / rangeY,
      minX: mnX,
      minY: mnY,
    };
  })();

  const toPlotX = (val: number) => PADDING + (val - minX) * scaleX;
  const toPlotY = (val: number) => PLOT_HEIGHT - PADDING - (val - minY) * scaleY;

  // Zoom with mouse wheel
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      setTransform((prev) => {
        const newScale = Math.min(Math.max(prev.scale * factor, 0.5), 10);
        const ratio = newScale / prev.scale;
        return {
          scale: newScale,
          x: mx - ratio * (mx - prev.x),
          y: my - ratio * (my - prev.y),
        };
      });
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsPanning(true);
      setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    },
    [transform.x, transform.y]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning) {
        setTransform((prev) => ({
          ...prev,
          x: e.clientX - panStart.x,
          y: e.clientY - panStart.y,
        }));
      }
    },
    [isPanning, panStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const resetZoom = () => setTransform({ x: 0, y: 0, scale: 1 });

  // Gather unique categories for legend
  const legendItems = (() => {
    if (!data) return [];
    const seen = new Map<string, string>();
    for (const pt of data.points) {
      const val = colorMode === "label" ? pt.label : pt.prediction;
      if (val && !seen.has(val)) {
        const color = LABEL_COLORS[val.toLowerCase()] || "#6366f1";
        seen.set(val, color);
      }
    }
    return Array.from(seen.entries()).map(([name, color]) => ({ name, color }));
  })();

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-sm text-gray-500">Loading embedding projection...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-sm text-gray-400">
          Embedding projection unavailable.
        </p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold">
          Embedding Space &mdash; {data.method.toUpperCase()} projection
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-500">Color by:</span>
            <button
              onClick={() => setColorMode("label")}
              className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                colorMode === "label"
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              Label
            </button>
            <button
              onClick={() => setColorMode("prediction")}
              className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                colorMode === "prediction"
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              Prediction
            </button>
          </div>
          <button
            onClick={resetZoom}
            className="text-xs text-gray-400 hover:text-gray-600 transition"
          >
            Reset zoom
          </button>
        </div>
      </div>

      {/* Subtitle: explained variance */}
      <p className="text-xs text-gray-400 mb-3">
        Explained variance: PC1 {(data.explained_variance[0] * 100).toFixed(1)}%
        {data.explained_variance[1] != null &&
          `, PC2 ${(data.explained_variance[1] * 100).toFixed(1)}%`}
        {" | "}
        {data.points.length} of {data.total_patches} patches shown
      </p>

      {/* Scatter plot */}
      <div className="relative overflow-hidden rounded border border-gray-100 bg-gray-50">
        <svg
          ref={svgRef}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          className="block select-none"
          style={{ cursor: isPanning ? "grabbing" : "grab" }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <g
            transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}
          >
            {data.points.map((pt) => {
              const { fill, opacity } = getPointColor(pt, colorMode);
              const cx = toPlotX(pt.x);
              const cy = toPlotY(pt.y);
              return (
                <circle
                  key={pt.patch_id}
                  cx={cx}
                  cy={cy}
                  r={3}
                  fill={fill}
                  opacity={opacity}
                  stroke={
                    hoveredPoint?.patch_id === pt.patch_id
                      ? "#1e1e1e"
                      : "none"
                  }
                  strokeWidth={hoveredPoint?.patch_id === pt.patch_id ? 2 : 0}
                  onMouseEnter={(e) => {
                    setHoveredPoint(pt);
                    const rect =
                      svgRef.current?.getBoundingClientRect();
                    if (rect) {
                      setTooltipPos({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                      });
                    }
                  }}
                  onMouseLeave={() => setHoveredPoint(null)}
                  className="transition-all duration-75"
                />
              );
            })}
          </g>
        </svg>

        {/* Tooltip */}
        {hoveredPoint && (
          <div
            className="absolute pointer-events-none bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs z-50"
            style={{
              left: tooltipPos.x + 12,
              top: tooltipPos.y - 10,
              maxWidth: 220,
            }}
          >
            <img
              src={`${API_URL}/api/v1/slides/${slideId}/patches/${hoveredPoint.patch_id}/image`}
              alt="patch"
              className="w-16 h-16 rounded border border-gray-100 mb-2 object-cover"
            />
            <div className="space-y-0.5">
              <p>
                <span className="text-gray-400">Coords:</span>{" "}
                ({hoveredPoint.slide_x}, {hoveredPoint.slide_y})
              </p>
              {hoveredPoint.label && (
                <p>
                  <span className="text-gray-400">Label:</span>{" "}
                  <span className="font-medium">{hoveredPoint.label}</span>
                </p>
              )}
              {hoveredPoint.prediction && (
                <p>
                  <span className="text-gray-400">Prediction:</span>{" "}
                  <span className="font-medium">{hoveredPoint.prediction}</span>
                  {hoveredPoint.confidence != null && (
                    <span className="text-gray-400">
                      {" "}
                      ({(hoveredPoint.confidence * 100).toFixed(0)}%)
                    </span>
                  )}
                </p>
              )}
              {!hoveredPoint.label && !hoveredPoint.prediction && (
                <p className="text-gray-400 italic">No label or prediction</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      {legendItems.length > 0 && (
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          {legendItems.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-gray-600">{item.name}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: DEFAULT_COLOR }}
            />
            <span className="text-gray-400">unlabeled</span>
          </div>
        </div>
      )}
    </div>
  );
}
