"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import type { Slide, Patch, Classifier } from "@/lib/types";
import WSIViewer from "@/components/viewer/WSIViewer";

export default function SlideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [slide, setSlide] = useState<Slide | null>(null);
  const [patches, setPatches] = useState<Patch[]>([]);
  const [embedding, setEmbedding] = useState<{ status: string; current?: number; total?: number } | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [embeddingCount, setEmbeddingCount] = useState<number | null>(null);

  // Inference state
  const [classifiers, setClassifiers] = useState<Classifier[]>([]);
  const [selectedClassifier, setSelectedClassifier] = useState<string>("");
  const [inferenceLoading, setInferenceLoading] = useState(false);
  const [inferenceError, setInferenceError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/slides/${id}`).then((r) => r.json()).then(setSlide);
    fetch(`${API_URL}/api/v1/slides/${id}/patches?limit=50`).then((r) => r.json()).then(setPatches);
    // Fetch embedding count for this slide
    fetch(`${API_URL}/api/v1/embeddings/slide/${id}/count`)
      .then((r) => r.json())
      .then((data) => setEmbeddingCount(data.count ?? data))
      .catch(() => {});
    // Fetch available classifiers for inference
    fetch(`${API_URL}/api/v1/classifiers`)
      .then((r) => r.json())
      .then((data: Classifier[]) => {
        const ready = data.filter((c) => c.status === "ready");
        setClassifiers(ready);
        if (ready.length > 0) setSelectedClassifier(ready[0].id);
      })
      .catch(() => {});
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
        // Refresh embedding count
        fetch(`${API_URL}/api/v1/embeddings/slide/${id}/count`)
          .then((r) => r.json())
          .then((d) => setEmbeddingCount(d.count ?? d))
          .catch(() => {});
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [taskId, id]);

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

  const runInference = async () => {
    if (!selectedClassifier) return;
    setInferenceLoading(true);
    setInferenceError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/inference/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide_id: id, classifier_id: selectedClassifier }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Error ${res.status}`);
      }
      const job = await res.json();
      router.push(`/inference/${job.id}`);
    } catch (err: any) {
      setInferenceError(err.message || "Failed to start inference");
    } finally {
      setInferenceLoading(false);
    }
  };

  if (!slide) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
    </div>
  );

  const hasEmbeddings = embeddingCount !== null && embeddingCount > 0;

  return (
    <div>
      <Link href="/slides" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Slides
      </Link>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">{slide.filename}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {slide.width && slide.height ? `${slide.width} x ${slide.height}` : ""}{" "}
            {slide.magnification ? `@ ${slide.magnification}x` : ""}{" "}
            {slide.vendor ? `(${slide.vendor})` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Export Patch IDs */}
          {slide.tile_count > 0 && (
            <a
              href={`${API_URL}/api/v1/slides/${id}/export/patches/csv`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" /></svg>
              Export Patch IDs
            </a>
          )}
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
          <p className="text-xs text-gray-500">Embeddings</p>
          <p className="text-2xl font-bold">{embeddingCount ?? "-"}</p>
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
              {hasEmbeddings ? "Regenerate Embeddings" : "Generate Embeddings"}
            </button>
          )}
        </div>
      )}

      {/* Run Inference */}
      {slide.status === "tiled" && hasEmbeddings && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Run Inference</h2>
          {classifiers.length === 0 ? (
            <p className="text-sm text-gray-500">
              No trained classifiers available.{" "}
              <a href="/classifiers/new" className="text-indigo-600 hover:underline">
                Train a classifier
              </a>{" "}
              first.
            </p>
          ) : (
            <div className="flex items-end gap-4">
              <div className="flex-1 max-w-md">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Classifier
                </label>
                <select
                  value={selectedClassifier}
                  onChange={(e) => setSelectedClassifier(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {classifiers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.n_classes} classes, {c.n_training_samples ?? 0} samples
                      {c.metrics?.auc ? `, AUC ${c.metrics.auc.toFixed(3)}` : ""})
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={runInference}
                disabled={inferenceLoading || !selectedClassifier}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
              >
                {inferenceLoading ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Starting...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Run Inference
                  </>
                )}
              </button>
            </div>
          )}
          {inferenceError && (
            <p className="text-red-600 text-sm mt-3">{inferenceError}</p>
          )}
        </div>
      )}

      {/* WSI Viewer */}
      <WSIViewer slideId={id} />

      {/* Patch grid */}
      {patches.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">
              Patches ({slide.tile_count} total, showing first {patches.length})
            </h2>
          </div>
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
