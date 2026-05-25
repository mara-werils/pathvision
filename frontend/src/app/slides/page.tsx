"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Slide = {
  id: string;
  filename: string;
  status: string;
  tile_count: number;
  file_size_bytes: number | null;
  created_at: string;
};

export default function SlidesPage() {
  const [slides, setSlides] = useState<Slide[]>([]);

  useEffect(() => {
    fetch(`${API}/api/v1/slides`)
      .then((r) => r.json())
      .then(setSlides)
      .catch(() => []);
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Slides</h1>
        <Link
          href="/slides/upload"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          Upload Slide
        </Link>
      </div>

      {slides.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          <p>No slides uploaded yet.</p>
          <p className="mt-2">
            <Link href="/slides/upload" className="text-indigo-600 hover:underline font-medium">
              Upload your first slide
            </Link>
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3">Filename</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Patches</th>
                <th className="text-left px-4 py-3">Size</th>
                <th className="text-left px-4 py-3">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {slides.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/slides/${s.id}`} className="text-indigo-600 hover:underline">
                      {s.filename}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        s.status === "tiled"
                          ? "bg-green-100 text-green-700"
                          : s.status === "error"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{s.tile_count}</td>
                  <td className="px-4 py-3">
                    {s.file_size_bytes
                      ? `${(s.file_size_bytes / 1024 / 1024).toFixed(1)} MB`
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
