"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { API_URL } from "@/lib/api";
import type { Slide, Patch } from "@/lib/types";

export default function SlideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [slide, setSlide] = useState<Slide | null>(null);
  const [patches, setPatches] = useState<Patch[]>([]);
  const [embedding, setEmbedding] = useState<{ status: string; current?: number; total?: number } | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/slides/${id}`).then((r) => r.json()).then(setSlide);
    fetch(`${API_URL}/api/v1/slides/${id}/patches?limit=50`).then((r) => r.json()).then(setPatches);
  }, [id]);

  // Poll embedding status
  useEffect(() => {
    if (!taskId) return;
    const interval = setInterval(async () => {
      const res = await fetch(`${API_URL}/api/v1/embeddings/status/${taskId}`);
      const data = await res.json();
      setEmbedding(data);
      if (data.status === "done" || data.status === "error") {
        clearInterval(interval);
        setTaskId(null);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [taskId]);

  const generateEmbeddings = async () => {
    const res = await fetch(`${API_URL}/api/v1/embeddings/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slide_id: id }),
    });
    const data = await res.json();
    if (data.task_id) {
      setTaskId(data.task_id);
      setEmbedding({ status: "starting" });
    }
  };

  if (!slide) return <p className="p-6">Loading...</p>;

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">{slide.filename}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {slide.width && slide.height ? `${slide.width} x ${slide.height}` : ""}{" "}
            {slide.magnification ? `@ ${slide.magnification}x` : ""}{" "}
            {slide.vendor ? `(${slide.vendor})` : ""}
          </p>
        </div>
        <span
          className={`px-3 py-1 text-sm rounded-full ${
            slide.status === "tiled"
              ? "bg-green-100 text-green-700"
              : slide.status === "error"
              ? "bg-red-100 text-red-700"
              : "bg-yellow-100 text-yellow-700"
          }`}
        >
          {slide.status}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Patches</p>
          <p className="text-2xl font-bold">{slide.tile_count}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Size</p>
          <p className="text-2xl font-bold">
            {slide.file_size_bytes ? `${(slide.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : "-"}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Magnification</p>
          <p className="text-2xl font-bold">{slide.magnification || "-"}x</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500">Status</p>
          <p className="text-2xl font-bold">{slide.status}</p>
        </div>
      </div>

      {/* Embedding generation */}
      {slide.status === "tiled" && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Embeddings</h2>
          {embedding && embedding.status === "running" ? (
            <div>
              <p className="text-sm text-gray-600 mb-2">
                Generating: {embedding.current}/{embedding.total} patches
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all"
                  style={{
                    width: `${embedding.total ? (embedding.current! / embedding.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ) : embedding?.status === "done" ? (
            <p className="text-green-600 text-sm">Embeddings generated successfully.</p>
          ) : (
            <button
              onClick={generateEmbeddings}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              Generate Embeddings
            </button>
          )}
        </div>
      )}

      {/* Thumbnail */}
      {slide.thumbnail_path && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Thumbnail</h2>
          <img
            src={`${API_URL}/api/v1/slides/${id}/thumbnail`}
            alt="Slide thumbnail"
            className="max-w-md rounded border"
          />
        </div>
      )}

      {/* Patch grid */}
      {patches.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-3">
            Patches ({slide.tile_count} total, showing first {patches.length})
          </h2>
          <div className="grid grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1">
            {patches.map((p) => (
              <div key={p.id} className="relative group">
                <img
                  src={`${API_URL}/api/v1/slides/${id}/patches/${p.id}/image`}
                  alt={`Patch ${p.x},${p.y}`}
                  className="w-full aspect-square object-cover rounded"
                  loading="lazy"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 opacity-0 group-hover:opacity-100 transition">
                  ({p.x}, {p.y}) t={p.tissue_fraction?.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
