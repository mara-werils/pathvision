"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";

type Stats = {
  slides: number;
  patches: number;
  embeddings: number;
  classifiers: number;
  ready_classifiers: number;
  inference_jobs: number;
};

type Activity = {
  type: string;
  id: string;
  name: string;
  status: string;
  time: string;
};

type Health = {
  status: string;
  gpu_available: boolean;
  gpu_name: string | null;
  disk_total_gb: number;
  disk_used_gb: number;
  disk_free_gb: number;
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/dashboard/stats`).then((r) => r.json()).then(setStats).catch(() => {});
    fetch(`${API_URL}/api/v1/dashboard/recent`).then((r) => r.json()).then(setActivity).catch(() => {});
    fetch(`${API_URL}/api/v1/dashboard/health`).then((r) => r.json()).then(setHealth).catch(() => {});
  }, []);

  const statCards = [
    { label: "Slides", value: stats?.slides, color: "text-indigo-600" },
    { label: "Patches", value: stats?.patches, color: "text-blue-600" },
    { label: "Embeddings", value: stats?.embeddings, color: "text-purple-600" },
    { label: "Classifiers", value: stats?.ready_classifiers, color: "text-emerald-600" },
    { label: "Inference Jobs", value: stats?.inference_jobs, color: "text-amber-600" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-lg shadow p-4">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.color}`}>
              {s.value != null ? s.value.toLocaleString() : "-"}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="flex flex-col gap-3">
            <Link
              href="/slides/upload"
              className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-center text-sm font-medium"
            >
              Upload Slide
            </Link>
            <Link
              href="/classifiers/new"
              className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-center text-sm font-medium"
            >
              Train Classifier
            </Link>
            <Link
              href="/search"
              className="px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition text-center text-sm font-medium"
            >
              Search Patches
            </Link>
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">System Health</h2>
          {health ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">GPU</span>
                <span className={health.gpu_available ? "text-green-600 font-medium" : "text-gray-400"}>
                  {health.gpu_available ? health.gpu_name || "Available" : "Not available"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Disk Used</span>
                <span>{health.disk_used_gb} / {health.disk_total_gb} GB</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full"
                  style={{
                    width: `${health.disk_total_gb ? (health.disk_used_gb / health.disk_total_gb) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Free</span>
                <span className="text-green-600">{health.disk_free_gb} GB</span>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Loading...</p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          {activity.length === 0 ? (
            <p className="text-gray-400 text-sm">No activity yet</p>
          ) : (
            <div className="space-y-3">
              {activity.map((a, i) => (
                <Link
                  key={i}
                  href={
                    a.type === "slide"
                      ? `/slides/${a.id}`
                      : a.type === "classifier"
                      ? `/classifiers/${a.id}`
                      : `/inference/${a.id}`
                  }
                  className="flex items-center gap-3 text-sm hover:bg-gray-50 rounded p-1 -m-1 transition"
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      a.status === "ready" || a.status === "tiled" || a.status === "complete"
                        ? "bg-green-500"
                        : a.status === "error"
                        ? "bg-red-500"
                        : "bg-yellow-500"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="text-xs text-gray-400">
                      {a.type} &middot; {new Date(a.time).toLocaleString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
