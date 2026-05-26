"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/lib/api";

type LabelStats = {
  interactive: number;
  imported: number;
  interactiveClasses: Record<string, number>;
  importedClasses: Record<string, number>;
};

export default function NewClassifierPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [classes, setClasses] = useState("normal,tumor");
  const [description, setDescription] = useState("");
  const [labelSource, setLabelSource] = useState<"interactive" | "all">("interactive");
  const [training, setTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [labelStats, setLabelStats] = useState<LabelStats | null>(null);

  // CSV upload (secondary)
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/dashboard/stats`)
      .then((r) => r.json())
      .then((data) => {
        const interactive = data.interactive_labels ?? 0;
        const total = data.labels ?? 0;
        setLabelStats({
          interactive,
          imported: total - interactive,
          interactiveClasses: data.interactive_classes ?? {},
          importedClasses: data.label_classes ?? {},
        });
      })
      .catch(() => {});
  }, []);

  const uploadLabels = async () => {
    if (!labelFile) return;
    setError(null);
    setUploadSuccess(null);
    setUploading(true);
    const formData = new FormData();
    formData.append("file", labelFile);
    try {
      const res = await fetch(`${API_URL}/api/v1/classifiers/labels/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setUploadSuccess(`Labels uploaded: ${data.labels_added} added`);
    } catch {
      setError("Failed to upload labels");
    } finally {
      setUploading(false);
    }
  };

  const startTraining = async () => {
    setError(null);
    const classNames = classes.split(",").map((c) => c.trim()).filter(Boolean);
    if (classNames.length < 2) {
      setError("Need at least 2 class names");
      return;
    }
    if (!name.trim()) {
      setError("Enter a classifier name");
      return;
    }

    setTraining(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/classifiers/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          class_names: classNames,
          label_source: labelSource === "interactive" ? "interactive" : null,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Error ${res.status}`);
      }
      const clf = await res.json();
      router.push(`/classifiers/${clf.id}`);
    } catch (err: any) {
      setError(err.message || "Training failed to start");
      setTraining(false);
    }
  };

  const activeCount = labelSource === "interactive"
    ? (labelStats?.interactive ?? 0)
    : (labelStats?.interactive ?? 0) + (labelStats?.imported ?? 0);
  const canTrain = activeCount >= 10;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Train New Classifier</h1>
      <p className="text-sm text-gray-500 mb-6">
        Train a model using doctor-labeled patches. By default, only your interactive labels are used.
      </p>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {/* Label Status */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3">Your Labels</h2>

        {/* Interactive labels */}
        <div className={`rounded-lg p-4 mb-3 ${labelSource === "interactive" ? "bg-indigo-50 border border-indigo-200" : "bg-gray-50"}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="src-interactive"
                checked={labelSource === "interactive"}
                onChange={() => setLabelSource("interactive")}
                className="accent-indigo-600"
              />
              <label htmlFor="src-interactive" className="text-sm font-medium text-gray-800">
                Doctor labels (interactive)
              </label>
            </div>
            <span className="text-lg font-bold text-gray-900">{labelStats?.interactive ?? 0}</span>
          </div>
          {labelStats?.interactiveClasses && Object.keys(labelStats.interactiveClasses).length > 0 && (
            <div className="flex gap-2 flex-wrap ml-5">
              {Object.entries(labelStats.interactiveClasses).map(([cls, count]) => (
                <span key={cls} className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  cls === "normal" ? "text-green-700 bg-green-100" :
                  cls === "tumor" ? "text-red-700 bg-red-100" :
                  "text-indigo-700 bg-indigo-100"
                }`}>
                  {cls}: {count}
                </span>
              ))}
            </div>
          )}
          {(labelStats?.interactive ?? 0) === 0 && (
            <div className="ml-5 mt-1">
              <Link href="/slides" className="inline-flex items-center gap-1 text-sm text-indigo-600 font-medium hover:underline">
                Start labeling on a slide
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </Link>
            </div>
          )}
        </div>

        {/* Imported labels */}
        {(labelStats?.imported ?? 0) > 0 && (
          <div className={`rounded-lg p-4 ${labelSource === "all" ? "bg-indigo-50 border border-indigo-200" : "bg-gray-50"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  id="src-all"
                  checked={labelSource === "all"}
                  onChange={() => setLabelSource("all")}
                  className="accent-indigo-600"
                />
                <label htmlFor="src-all" className="text-sm font-medium text-gray-800">
                  All labels (doctor + imported CSV)
                </label>
              </div>
              <span className="text-lg font-bold text-gray-900">
                {(labelStats?.interactive ?? 0) + (labelStats?.imported ?? 0)}
              </span>
            </div>
            <p className="text-xs text-gray-400 ml-5 mt-1">
              Includes {labelStats?.imported ?? 0} labels imported from CSV
            </p>
          </div>
        )}
      </div>

      {/* Configure */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3">Configure</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Breast Cancer Metastasis"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Classes (comma-separated)
            </label>
            <input
              type="text"
              value={classes}
              onChange={(e) => setClasses(e.target.value)}
              placeholder="normal,tumor"
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={2}
            />
          </div>
        </div>
      </div>

      {/* Train */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3">Train</h2>
        {!canTrain ? (
          <div>
            <p className="text-sm text-gray-500 mb-2">
              Need at least 10 {labelSource === "interactive" ? "doctor" : ""} labels to start training. You have {activeCount}.
            </p>
            <Link href="/slides" className="inline-flex items-center gap-1 text-sm text-indigo-600 font-medium hover:underline">
              Label more patches
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500 mb-3">
              Training on <strong>{activeCount} {labelSource === "interactive" ? "doctor" : ""} labels</strong>
            </p>
            <button
              onClick={startTraining}
              disabled={training || !name.trim()}
              className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition font-medium"
            >
              {training ? "Starting training..." : `Train on ${activeCount} labels`}
            </button>
          </div>
        )}
      </div>

      {/* CSV Upload — secondary */}
      <div className="bg-white rounded-lg shadow p-6">
        <button
          onClick={() => setShowCsvUpload(!showCsvUpload)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition"
        >
          <svg className={`w-4 h-4 transition-transform ${showCsvUpload ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Advanced: Import labels from CSV
        </button>
        {showCsvUpload && (
          <div className="mt-4">
            <p className="text-sm text-gray-500 mb-3">
              CSV with columns: <code className="bg-gray-100 px-1 rounded">patch_id,label</code>
            </p>
            <div className="flex gap-3">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setLabelFile(e.target.files?.[0] || null)}
                className="text-sm"
              />
              <button
                onClick={uploadLabels}
                disabled={!labelFile || uploading}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 transition text-sm"
              >
                {uploading ? "Uploading..." : "Upload Labels"}
              </button>
            </div>
            {uploadSuccess && <p className="text-green-600 text-sm mt-2">{uploadSuccess}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
