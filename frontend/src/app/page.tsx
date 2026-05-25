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

type FetchState = "loading" | "loaded" | "error";

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const errs: string[] = [];

    Promise.allSettled([
      fetch(`${API_URL}/api/v1/dashboard/stats`)
        .then((r) => {
          if (!r.ok) throw new Error(`Stats: ${r.status}`);
          return r.json();
        })
        .then(setStats)
        .catch((e) => {
          errs.push(e.message || "Failed to load stats");
        }),
      fetch(`${API_URL}/api/v1/dashboard/recent`)
        .then((r) => {
          if (!r.ok) throw new Error(`Activity: ${r.status}`);
          return r.json();
        })
        .then(setActivity)
        .catch((e) => {
          errs.push(e.message || "Failed to load activity");
        }),
      fetch(`${API_URL}/api/v1/dashboard/health`)
        .then((r) => {
          if (!r.ok) throw new Error(`Health: ${r.status}`);
          return r.json();
        })
        .then(setHealth)
        .catch((e) => {
          errs.push(e.message || "Failed to load health");
        }),
    ]).then(() => {
      if (errs.length > 0) setErrors(errs);
      setFetchState(errs.length === 3 ? "error" : "loaded");
    });
  }, []);

  const statCards = [
    {
      label: "Slides",
      value: stats?.slides,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      iconBg: "bg-indigo-100",
      href: "/slides",
      icon: (
        <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      label: "Patches",
      value: stats?.patches,
      color: "text-blue-600",
      bg: "bg-blue-50",
      iconBg: "bg-blue-100",
      href: "/slides",
      icon: (
        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      label: "Embeddings",
      value: stats?.embeddings,
      color: "text-purple-600",
      bg: "bg-purple-50",
      iconBg: "bg-purple-100",
      href: "/slides",
      icon: (
        <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
    },
    {
      label: "Classifiers",
      value: stats?.classifiers,
      subtitle: stats ? `${stats.ready_classifiers} ready` : undefined,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      iconBg: "bg-emerald-100",
      href: "/classifiers",
      icon: (
        <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      label: "Inference Jobs",
      value: stats?.inference_jobs,
      color: "text-amber-600",
      bg: "bg-amber-50",
      iconBg: "bg-amber-100",
      href: "/inference",
      icon: (
        <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
  ];

  const workflowSteps = [
    { step: 1, label: "Upload", desc: "Upload WSI slides", href: "/slides/upload", color: "bg-indigo-600" },
    { step: 2, label: "Embed", desc: "Generate embeddings", href: "/slides", color: "bg-blue-600" },
    { step: 3, label: "Label", desc: "Annotate patches", href: "/slides", color: "bg-purple-600" },
    { step: 4, label: "Train", desc: "Train classifier", href: "/classifiers/new", color: "bg-emerald-600" },
    { step: 5, label: "Infer", desc: "Run inference", href: "/inference", color: "bg-amber-600" },
  ];

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      complete: "bg-green-100 text-green-700",
      ready: "bg-green-100 text-green-700",
      tiled: "bg-green-100 text-green-700",
      running: "bg-yellow-100 text-yellow-700",
      processing: "bg-yellow-100 text-yellow-700",
      training: "bg-yellow-100 text-yellow-700",
      pending: "bg-gray-100 text-gray-600",
      error: "bg-red-100 text-red-700",
      failed: "bg-red-100 text-red-700",
    };
    return colors[status] || "bg-gray-100 text-gray-600";
  }

  // Loading state
  if (fetchState === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <svg className="animate-spin h-10 w-10 text-indigo-600" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-gray-500 text-sm">Loading dashboard...</p>
      </div>
    );
  }

  // Full error state
  if (fetchState === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <p className="text-gray-700 font-medium">Could not connect to the backend</p>
        <p className="text-gray-500 text-sm">Make sure the API server is running at {API_URL}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {errors.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
            </svg>
            <span>Some data failed to load</span>
          </div>
        )}
      </div>

      {/* Getting Started Workflow */}
      <div className="bg-white rounded-lg shadow p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Getting Started</h2>
        <div className="flex items-center gap-0 overflow-x-auto">
          {workflowSteps.map((ws, i) => (
            <div key={ws.step} className="flex items-center flex-shrink-0">
              <Link
                href={ws.href}
                className="flex flex-col items-center gap-1.5 group min-w-[90px]"
              >
                <div className={`w-9 h-9 rounded-full ${ws.color} text-white flex items-center justify-center text-sm font-bold group-hover:scale-110 transition-transform`}>
                  {ws.step}
                </div>
                <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{ws.label}</span>
                <span className="text-xs text-gray-400">{ws.desc}</span>
              </Link>
              {i < workflowSteps.length - 1 && (
                <div className="w-8 h-px bg-gray-300 mx-1 mt-[-20px]" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {statCards.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{s.label}</p>
              <div className={`w-8 h-8 rounded-lg ${s.iconBg} flex items-center justify-center`}>
                {s.icon}
              </div>
            </div>
            <p className={`text-3xl font-bold ${s.color}`}>
              {s.value != null ? s.value.toLocaleString() : "-"}
            </p>
            {s.subtitle && (
              <p className="text-xs text-gray-400 mt-1">{s.subtitle}</p>
            )}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="flex flex-col gap-3">
            <Link
              href="/slides/upload"
              className="flex items-center gap-3 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Slide
            </Link>
            <Link
              href="/classifiers/new"
              className="flex items-center gap-3 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Train Classifier
            </Link>
            <Link
              href="/inference"
              className="flex items-center gap-3 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              View Results
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
                  className="bg-indigo-600 h-2 rounded-full transition-all"
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
            <p className="text-gray-400 text-sm">Health data unavailable</p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            {activity.length > 0 && (
              <Link href="/inference" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                View all
              </Link>
            )}
          </div>
          {activity.length === 0 ? (
            <div className="text-center py-6">
              <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-400 text-sm">No recent activity</p>
              <p className="text-gray-300 text-xs mt-1">Upload a slide to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activity.slice(0, 5).map((a, i) => (
                <Link
                  key={i}
                  href={
                    a.type === "slide"
                      ? `/slides/${a.id}`
                      : a.type === "classifier"
                      ? `/classifiers/${a.id}`
                      : `/inference/${a.id}`
                  }
                  className="flex items-center gap-3 text-sm hover:bg-gray-50 rounded-lg p-2 -mx-2 transition"
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      a.status === "ready" || a.status === "tiled" || a.status === "complete"
                        ? "bg-green-500"
                        : a.status === "error" || a.status === "failed"
                        ? "bg-red-500"
                        : "bg-yellow-500 animate-pulse"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-800">{a.name}</p>
                    <p className="text-xs text-gray-400">
                      {a.type} &middot; {new Date(a.time).toLocaleString()}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusBadge(a.status)}`}>
                    {a.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
