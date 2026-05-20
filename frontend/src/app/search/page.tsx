"use client";

import { useState } from "react";
import { API_URL } from "@/lib/api";

type SearchResult = {
  patch_id: string;
  slide_id: string;
  similarity: number;
};

export default function SearchPage() {
  const [patchId, setPatchId] = useState("");
  const [k, setK] = useState(20);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [indexStats, setIndexStats] = useState<{ total_vectors: number } | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const searchByPatchId = async () => {
    if (!patchId.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/search/similar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch_id: patchId, k }),
      });
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      alert("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const searchByImage = async () => {
    if (!uploadFile) return;
    setSearching(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      const res = await fetch(`${API_URL}/api/v1/search/similar/upload?k=${k}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch {
      alert("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const rebuildIndex = async () => {
    setRebuilding(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/search/index/rebuild`, { method: "POST" });
      const data = await res.json();
      alert(`Index rebuilt: ${data.vectors} vectors`);
      fetchStats();
    } catch {
      alert("Rebuild failed");
    } finally {
      setRebuilding(false);
    }
  };

  const fetchStats = async () => {
    const res = await fetch(`${API_URL}/api/v1/search/index/stats`);
    setIndexStats(await res.json());
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Similar Patch Search</h1>
        <div className="flex gap-3 items-center">
          <button
            onClick={fetchStats}
            className="text-sm text-indigo-600 hover:underline"
          >
            Check Index
          </button>
          {indexStats && (
            <span className="text-sm text-gray-500">
              {indexStats.total_vectors} vectors indexed
            </span>
          )}
          <button
            onClick={rebuildIndex}
            disabled={rebuilding}
            className="px-3 py-1.5 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900 disabled:opacity-50"
          >
            {rebuilding ? "Rebuilding..." : "Rebuild Index"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Search by patch ID */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-3">Search by Patch ID</h2>
          <input
            type="text"
            value={patchId}
            onChange={(e) => setPatchId(e.target.value)}
            placeholder="Enter patch UUID"
            className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
          />
          <div className="flex gap-3 items-center">
            <label className="text-sm text-gray-600">
              Top-K:
              <input
                type="number"
                value={k}
                onChange={(e) => setK(parseInt(e.target.value) || 20)}
                className="w-16 border rounded px-2 py-1 ml-2 text-sm"
              />
            </label>
            <button
              onClick={searchByPatchId}
              disabled={searching}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
        </div>

        {/* Search by uploaded image */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-3">Search by Image</h2>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            className="text-sm mb-3"
          />
          <button
            onClick={searchByImage}
            disabled={searching || !uploadFile}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
          >
            {searching ? "Searching..." : "Search by Image"}
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-3">
            Results ({results.length} matches)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {results.map((r, i) => (
              <div key={i} className="border rounded-lg overflow-hidden">
                <img
                  src={`${API_URL}/api/v1/slides/${r.slide_id}/patches/${r.patch_id}/image`}
                  alt={`Match ${i + 1}`}
                  className="w-full aspect-square object-cover"
                  loading="lazy"
                />
                <div className="p-2 text-xs">
                  <p className="font-mono text-gray-500">{r.patch_id.slice(0, 8)}...</p>
                  <p className="text-indigo-600 font-medium">
                    {(r.similarity * 100).toFixed(1)}% similar
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
