"use client";

import { useEffect, useState, useRef } from "react";
import { API_URL } from "@/lib/api";
import type { Slide, Patch } from "@/lib/types";

type SearchResult = {
  patch_id: string;
  slide_id: string;
  similarity: number;
};

export default function DemoPage() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selectedSlide, setSelectedSlide] = useState<Slide | null>(null);
  const [patches, setPatches] = useState<Patch[]>([]);
  const [selectedPatch, setSelectedPatch] = useState<Patch | null>(null);
  const [similarPatches, setSimilarPatches] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploadSearching, setUploadSearching] = useState(false);
  const [uploadResults, setUploadResults] = useState<SearchResult[]>([]);
  const [embeddingPreview, setEmbeddingPreview] = useState<number[] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load slides
  useEffect(() => {
    fetch(`${API_URL}/api/v1/slides`)
      .then((r) => r.json())
      .then((data) => {
        const tiled = data.filter((s: Slide) => s.status === "tiled");
        setSlides(tiled);
        if (tiled.length > 0) selectSlide(tiled[0]);
      });
  }, []);

  const selectSlide = async (slide: Slide) => {
    setSelectedSlide(slide);
    setSelectedPatch(null);
    setSimilarPatches([]);
    const res = await fetch(`${API_URL}/api/v1/slides/${slide.id}/patches?limit=200`);
    setPatches(await res.json());
  };

  const selectPatch = async (patch: Patch) => {
    setSelectedPatch(patch);
    setSimilarPatches([]);
    setSearching(true);

    try {
      // Search similar
      const res = await fetch(`${API_URL}/api/v1/search/similar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch_id: patch.id, k: 12, exclude_same_slide: false }),
      });
      const results = await res.json();
      setSimilarPatches(Array.isArray(results) ? results : []);
    } catch {
      setSimilarPatches([]);
    }
    setSearching(false);
  };

  const handleUploadSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadSearching(true);
    setUploadResults([]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_URL}/api/v1/search/similar/upload?k=12`, {
        method: "POST",
        body: formData,
      });
      const results = await res.json();
      setUploadResults(Array.isArray(results) ? results : []);
    } catch {
      setUploadResults([]);
    }
    setUploadSearching(false);
  };

  // Draw embedding as mini visualization
  useEffect(() => {
    if (!embeddingPreview || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw 384-dim embedding as 16x24 colored grid
    const cols = 24;
    const rows = 16;
    const cellW = w / cols;
    const cellH = h / rows;
    const min = Math.min(...embeddingPreview);
    const max = Math.max(...embeddingPreview);
    const range = max - min || 1;

    for (let i = 0; i < embeddingPreview.length && i < rows * cols; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const norm = (embeddingPreview[i] - min) / range;
      const hue = (1 - norm) * 240; // blue -> red
      ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
      ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
    }
  }, [embeddingPreview]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Interactive Demo</h1>
      <p className="text-sm text-gray-500 mb-6">
        Click a patch to find similar tissue regions using Path Foundation embeddings (384-dim).
        Inspired by{" "}
        <a
          href="https://huggingface.co/spaces/google/path-foundation-demo"
          target="_blank"
          className="text-indigo-600 hover:underline"
        >
          Google&apos;s Path Foundation Demo
        </a>
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Slide selector + patch grid */}
        <div className="lg:col-span-2">
          {/* Slide selector */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-600 mb-2">Select Slide</h2>
            <div className="flex gap-2 flex-wrap">
              {slides.map((s) => (
                <button
                  key={s.id}
                  onClick={() => selectSlide(s)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition ${
                    selectedSlide?.id === s.id
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {s.filename} ({s.tile_count} patches)
                </button>
              ))}
            </div>
          </div>

          {/* Patch grid */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-sm font-semibold text-gray-600 mb-2">
              Patches — click to find similar
              {selectedPatch && (
                <span className="ml-2 text-indigo-600">
                  Selected: ({selectedPatch.x}, {selectedPatch.y})
                </span>
              )}
            </h2>
            <div className="grid grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-0.5 max-h-[500px] overflow-y-auto">
              {patches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPatch(p)}
                  className={`relative aspect-square overflow-hidden rounded transition ${
                    selectedPatch?.id === p.id
                      ? "ring-3 ring-indigo-500 z-10 scale-110"
                      : "hover:ring-2 hover:ring-indigo-300"
                  }`}
                >
                  <img
                    src={`${API_URL}/api/v1/slides/${selectedSlide?.id}/patches/${p.id}/image`}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Upload search */}
          <div className="bg-white rounded-lg shadow p-4 mt-4">
            <h2 className="text-sm font-semibold text-gray-600 mb-2">
              Or upload your own patch image
            </h2>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadSearch}
                className="text-sm"
              />
              {uploadSearching && <span className="text-sm text-gray-500">Searching...</span>}
            </div>
            {uploadResults.length > 0 && (
              <div className="mt-3">
                <h3 className="text-xs font-semibold text-gray-500 mb-2">
                  Similar patches from database:
                </h3>
                <div className="grid grid-cols-6 gap-1">
                  {uploadResults.map((r, i) => (
                    <div key={i} className="relative">
                      <img
                        src={`${API_URL}/api/v1/slides/${r.slide_id}/patches/${r.patch_id}/image`}
                        alt=""
                        className="w-full aspect-square object-cover rounded"
                        loading="lazy"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[8px] text-center py-0.5">
                        {(r.similarity * 100).toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Selected patch details + similar results */}
        <div>
          {/* Selected patch */}
          {selectedPatch && selectedSlide && (
            <div className="bg-white rounded-lg shadow p-4 mb-4">
              <h2 className="text-sm font-semibold text-gray-600 mb-2">Query Patch</h2>
              <img
                src={`${API_URL}/api/v1/slides/${selectedSlide.id}/patches/${selectedPatch.id}/image`}
                alt="Selected patch"
                className="w-full rounded border mb-3"
              />
              <div className="text-xs text-gray-500 space-y-1">
                <p>Position: ({selectedPatch.x}, {selectedPatch.y})</p>
                <p>Tissue: {((selectedPatch.tissue_fraction || 0) * 100).toFixed(0)}%</p>
                <p>ID: {selectedPatch.id.slice(0, 12)}...</p>
              </div>

              {/* Embedding visualization */}
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">
                  384-dim Embedding
                </p>
                <canvas
                  ref={canvasRef}
                  width={240}
                  height={160}
                  className="w-full rounded border bg-gray-50"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  16×24 grid — blue=low, red=high activation
                </p>
              </div>
            </div>
          )}

          {/* Similar patches */}
          {searching && (
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <div className="animate-pulse text-gray-500">Searching similar patches...</div>
            </div>
          )}

          {!searching && similarPatches.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-sm font-semibold text-gray-600 mb-2">
                Similar Patches ({similarPatches.length})
              </h2>
              <div className="grid grid-cols-3 gap-1.5">
                {similarPatches.map((r, i) => (
                  <div
                    key={i}
                    className="relative group cursor-pointer"
                    onClick={() => {
                      // Find this patch in our patches list to select it
                      const found = patches.find((p) => p.id === r.patch_id);
                      if (found) selectPatch(found);
                    }}
                  >
                    <img
                      src={`${API_URL}/api/v1/slides/${r.slide_id}/patches/${r.patch_id}/image`}
                      alt={`Similar ${i + 1}`}
                      className="w-full aspect-square object-cover rounded"
                      loading="lazy"
                    />
                    <div className="absolute top-0 right-0 bg-black/70 text-white text-[9px] px-1 py-0.5 rounded-bl">
                      #{i + 1}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] text-center py-1 rounded-b">
                      {(r.similarity * 100).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!searching && !selectedPatch && (
            <div className="bg-white rounded-lg shadow p-6 text-center text-gray-400 text-sm">
              Click a patch from the grid to find similar tissue regions
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
