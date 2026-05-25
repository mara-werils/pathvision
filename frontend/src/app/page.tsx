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

type FetchState = "loading" | "loaded" | "error";

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("loading");

  useEffect(() => {
    Promise.allSettled([
      fetch(`${API_URL}/api/v1/dashboard/stats`)
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then(setStats),
      fetch(`${API_URL}/api/v1/dashboard/recent`)
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then(setActivity),
    ]).then((results) => {
      setFetchState(results.every((r) => r.status === "rejected") ? "error" : "loaded");
    });
  }, []);

  if (fetchState === "loading") {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (fetchState === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-gray-600 font-medium">Could not connect to backend</p>
        <button onClick={() => window.location.reload()} className="text-sm text-indigo-600 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const statItems = [
    { label: "Slides", value: stats?.slides, href: "/slides" },
    { label: "Patches", value: stats?.patches, href: "/slides" },
    { label: "Embeddings", value: stats?.embeddings, href: "/slides" },
    { label: "Classifiers", value: stats?.classifiers, sub: stats ? `${stats.ready_classifiers} ready` : undefined, href: "/classifiers" },
    { label: "Inference Jobs", value: stats?.inference_jobs, href: "/inference" },
  ];

  const steps = [
    { n: 1, label: "Upload", desc: "WSI slide", href: "/slides/upload" },
    { n: 2, label: "Embed", desc: "Generate vectors", href: "/slides" },
    { n: 3, label: "Label", desc: "Annotate patches", href: "/slides" },
    { n: 4, label: "Train", desc: "Build classifier", href: "/classifiers/new" },
    { n: 5, label: "Infer", desc: "Predict & export", href: "/inference" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {statItems.map((s) => (
          <Link key={s.label} href={s.href} className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 hover:border-gray-300 transition">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">
              {s.value != null ? s.value.toLocaleString() : "–"}
            </p>
            {s.sub && <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>}
          </Link>
        ))}
      </div>

      {/* Workflow */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 mb-8">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-4">Pipeline</p>
        <div className="flex items-start gap-0 overflow-x-auto">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center flex-shrink-0">
              <Link href={s.href} className="flex flex-col items-center gap-1.5 group min-w-[80px]">
                <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-semibold group-hover:bg-indigo-600 transition-colors">
                  {s.n}
                </div>
                <span className="text-sm font-medium text-gray-800">{s.label}</span>
                <span className="text-[11px] text-gray-400">{s.desc}</span>
              </Link>
              {i < steps.length - 1 && (
                <div className="w-10 h-px bg-gray-200 mx-1 mt-[-18px]" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-4">Quick Actions</p>
          <div className="flex flex-col gap-2">
            <Link href="/slides/upload" className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-900" />
              Upload Slide
            </Link>
            <Link href="/classifiers/new" className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-900" />
              Train Classifier
            </Link>
            <Link href="/inference" className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-900" />
              View Results
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Recent Activity</p>
            {activity.length > 0 && (
              <Link href="/inference" className="text-xs text-gray-400 hover:text-gray-600">View all</Link>
            )}
          </div>
          {activity.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">No activity yet</p>
          ) : (
            <div className="space-y-1">
              {activity.slice(0, 5).map((a, i) => (
                <Link
                  key={i}
                  href={a.type === "slide" ? `/slides/${a.id}` : a.type === "classifier" ? `/classifiers/${a.id}` : `/inference/${a.id}`}
                  className="flex items-center gap-3 text-sm hover:bg-gray-50 rounded-lg p-2 -mx-2 transition"
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    a.status === "ready" || a.status === "tiled" || a.status === "complete"
                      ? "bg-green-500"
                      : a.status === "error" ? "bg-red-500" : "bg-yellow-500"
                  }`} />
                  <span className="truncate flex-1 text-gray-700">{a.name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{a.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
