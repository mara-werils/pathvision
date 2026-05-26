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
  doctor_classifiers?: number;
  inference_jobs: number;
  labels?: number;
  interactive_labels?: number;
  interactive_classes?: Record<string, number>;
};

type SlideInfo = {
  id: string;
  filename: string;
  status: string;
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
  const [labelSlide, setLabelSlide] = useState<SlideInfo | null>(null);

  useEffect(() => {
    Promise.allSettled([
      fetch(`${API_URL}/api/v1/dashboard/stats`)
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then(setStats),
      fetch(`${API_URL}/api/v1/dashboard/recent`)
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then(setActivity),
      // Find first slide with embeddings for direct "Start Labeling" link
      fetch(`${API_URL}/api/v1/slides`)
        .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
        .then((slides: SlideInfo[]) => {
          const tiled = slides.find((s) => s.status === "tiled");
          if (tiled) setLabelSlide(tiled);
        }),
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

  const hasSlides = (stats?.slides ?? 0) > 0;
  const hasEmbeddings = (stats?.embeddings ?? 0) > 0;
  const labelCount = stats?.interactive_labels ?? 0;
  const hasLabels = labelCount >= 10;
  const hasDoctorClassifiers = (stats?.doctor_classifiers ?? 0) > 0;

  // Determine current workflow step — only doctor-trained classifiers count
  const currentStep = !hasSlides ? 1 : !hasEmbeddings ? 2 : !hasLabels ? 3 : !hasDoctorClassifiers ? 4 : 5;

  const steps = [
    {
      n: 1,
      label: "Upload",
      desc: "Upload WSI slide",
      href: "/slides/upload",
      done: hasSlides,
    },
    {
      n: 2,
      label: "Embed",
      desc: "Generate patch vectors",
      href: "/slides",
      done: hasEmbeddings,
    },
    {
      n: 3,
      label: "Label",
      desc: `Doctor labels patches (${labelCount}/${labelCount >= 10 ? 100 : 10})`,
      href: labelSlide ? `/slides/${labelSlide.id}` : "/slides",
      done: labelCount >= 100,
      active: hasEmbeddings && !hasLabels,
    },
    {
      n: 4,
      label: "Train",
      desc: "Build classifier from labels",
      href: "/classifiers/new",
      done: hasDoctorClassifiers,
      active: hasLabels && !hasDoctorClassifiers,
    },
    {
      n: 5,
      label: "Predict",
      desc: "Run inference & refine",
      href: labelSlide ? `/slides/${labelSlide.id}` : "/inference",
      done: hasDoctorClassifiers && (stats?.inference_jobs ?? 0) > 0,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">PathVision</h1>
      <p className="text-sm text-gray-500 mb-6">
        Doctor-guided tissue classification. Label patches, train a model, propagate predictions across the whole slide.
      </p>

      {/* Hero: Guided Workflow */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Your Workflow</p>
          {labelCount > 0 && (
            <span className="text-xs text-gray-500">{labelCount} patches labeled</span>
          )}
        </div>

        {/* Stepper */}
        <div className="flex items-start gap-0 overflow-x-auto mb-6">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-center flex-shrink-0">
              <Link href={s.href} className="flex flex-col items-center gap-1.5 group min-w-[100px]">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                    s.done
                      ? "bg-green-600 text-white"
                      : s.active || s.n === currentStep
                      ? "bg-indigo-600 text-white ring-2 ring-indigo-300 ring-offset-2"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {s.done ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    s.n
                  )}
                </div>
                <span className={`text-sm font-medium ${s.n === currentStep ? "text-indigo-700" : "text-gray-800"}`}>
                  {s.label}
                </span>
                <span className="text-[11px] text-gray-400 text-center leading-tight">{s.desc}</span>
              </Link>
              {i < steps.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 mt-[-22px] ${s.done ? "bg-green-400" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Contextual CTA */}
        {currentStep === 1 && (
          <Link
            href="/slides/upload"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-medium text-sm"
          >
            Upload Your First Slide
          </Link>
        )}
        {currentStep === 2 && (
          <div className="bg-indigo-50 rounded-lg p-4">
            <p className="text-sm text-indigo-800">
              Open a tiled slide and click <strong>Generate Embeddings</strong> to prepare patches for labeling.
            </p>
            <Link href="/slides" className="inline-flex items-center gap-1 mt-2 text-sm text-indigo-600 font-medium hover:underline">
              Go to Slides
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
          </div>
        )}
        {currentStep === 3 && (
          <div className="bg-indigo-50 rounded-lg p-4">
            <p className="text-sm text-indigo-800 mb-1">
              <strong>Label ~100 patches</strong> to train your first classifier. Open a slide and start labeling tissue as normal or tumor.
            </p>
            <div className="w-full bg-indigo-200 rounded-full h-2 mt-3 mb-1">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, labelCount)}%` }}
              />
            </div>
            <p className="text-xs text-indigo-500">{labelCount} / 100 labels — {labelCount < 10 ? "need at least 10 to train" : "ready to train, more labels = better accuracy"}</p>
            <Link href={labelSlide ? `/slides/${labelSlide.id}` : "/slides"} className="inline-flex items-center gap-1 mt-3 text-sm text-indigo-600 font-medium hover:underline">
              {labelSlide ? `Start Labeling on ${labelSlide.filename}` : "Start Labeling"}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
          </div>
        )}
        {currentStep === 4 && (
          <div className="bg-emerald-50 rounded-lg p-4">
            <p className="text-sm text-emerald-800">
              You have <strong>{labelCount} labels</strong>. Train a classifier now, then use active learning to refine it.
            </p>
            <Link
              href="/classifiers/new"
              className="inline-flex items-center gap-2 mt-3 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-medium text-sm"
            >
              Train Classifier
            </Link>
          </div>
        )}
        {currentStep === 5 && (
          <div className="bg-emerald-50 rounded-lg p-4">
            <p className="text-sm text-emerald-800 mb-2">
              Your classifier is ready. Run inference on slides, review results, then <strong>label uncertain patches</strong> and retrain for better accuracy.
            </p>
            <div className="flex gap-3">
              <Link href="/slides" className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition text-sm font-medium">
                Run Inference
              </Link>
              <Link href="/slides" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium">
                Label More Patches
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Active Learning Loop Explanation */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5 mb-6">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">How It Works</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { step: "1", title: "Label", desc: "Doctor marks ~100 patches as normal or tumor" },
            { step: "2", title: "Train", desc: "Model learns from your labels in seconds" },
            { step: "3", title: "Predict", desc: "Model classifies all remaining patches" },
            { step: "4", title: "Refine", desc: "Review uncertain patches, label more, retrain" },
          ].map((item) => (
            <div key={item.step} className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {item.step}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{item.title}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Repeat steps 1-4 to continuously improve accuracy
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[
          { label: "Slides", value: stats?.slides, href: "/slides" },
          { label: "Patches", value: stats?.patches, href: "/slides" },
          { label: "Doctor Labels", value: labelCount, href: "/slides" },
          { label: "Classifiers", value: stats?.classifiers, sub: stats ? `${stats.ready_classifiers} ready` : undefined, href: "/classifiers" },
          { label: "Inference Jobs", value: stats?.inference_jobs, href: "/inference" },
        ].map((s) => (
          <Link key={s.label} href={s.href} className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 hover:border-gray-300 transition">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-1">
              {s.value != null ? s.value.toLocaleString() : "–"}
            </p>
            {s.sub && <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>}
          </Link>
        ))}
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
          <p className="text-sm text-gray-400 py-6 text-center">No activity yet. Upload a slide to get started.</p>
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
  );
}
