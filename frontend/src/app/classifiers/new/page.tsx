"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

export default function NewClassifierPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [classes, setClasses] = useState("normal,tumor");
  const [description, setDescription] = useState("");
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [labelsUploaded, setLabelsUploaded] = useState(false);
  const [training, setTraining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const uploadLabels = async () => {
    if (!labelFile) return;
    setError(null);
    setSuccess(null);
    setUploading(true);
    const formData = new FormData();
    formData.append("file", labelFile);
    try {
      const res = await fetch(`${API_URL}/api/v1/classifiers/labels/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setSuccess(`Labels uploaded: ${data.labels_added} added`);
      setLabelsUploaded(true);
    } catch (err) {
      setError("Failed to upload labels");
    } finally {
      setUploading(false);
    }
  };

  const startTraining = async () => {
    setError(null);
    setSuccess(null);
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
        }),
      });
      const clf = await res.json();
      router.push(`/classifiers/${clf.id}`);
    } catch (err) {
      setError("Training failed to start");
      setTraining(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Train New Classifier</h1>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {success && <p className="text-green-600 text-sm mb-4">{success}</p>}

      {/* Step 1: Upload labels */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3">Step 1: Upload Labels (CSV)</h2>
        <p className="text-sm text-gray-500 mb-4">
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
        {labelsUploaded && (
          <p className="text-green-600 text-sm mt-2">Labels uploaded.</p>
        )}
      </div>

      {/* Step 2: Configure */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3">Step 2: Configure</h2>
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

      {/* Step 3: Train */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-3">Step 3: Train</h2>
        <button
          onClick={startTraining}
          disabled={training || !name.trim()}
          className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition font-medium"
        >
          {training ? "Starting training..." : "Start Training"}
        </button>
      </div>
    </div>
  );
}
