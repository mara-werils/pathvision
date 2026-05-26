"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import type { Classifier, Patch, LabelSummary, UncertainPatch } from "@/lib/types";

interface PatchLabelingPanelProps {
  slideId: string;
  classifiers: Classifier[];
}

const RECOMMENDED_LABELS = 100;
const MIN_LABELS = 10;

export default function PatchLabelingPanel({ slideId, classifiers }: PatchLabelingPanelProps) {
  const router = useRouter();
  const [summary, setSummary] = useState<LabelSummary | null>(null);
  const [patches, setPatches] = useState<Patch[]>([]);
  const [labeledMap, setLabeledMap] = useState<Record<string, string>>({});
  const [selectedClass, setSelectedClass] = useState<string>("tumor");
  const [customClass, setCustomClass] = useState("");
  const [classes, setClasses] = useState<string[]>(["normal", "tumor"]);
  const [loadingPatches, setLoadingPatches] = useState(false);

  // Inline training state
  const [trainingName, setTrainingName] = useState("");
  const [training, setTraining] = useState(false);
  const [trainError, setTrainError] = useState<string | null>(null);

  // Active learning state
  const [alClassifier, setAlClassifier] = useState<string>(classifiers[0]?.id || "");
  const [uncertainPatches, setUncertainPatches] = useState<UncertainPatch[]>([]);
  const [alLoading, setAlLoading] = useState(false);
  const [alError, setAlError] = useState<string | null>(null);
  const [alLabeledMap, setAlLabeledMap] = useState<Record<string, string>>({});

  const totalLabeled = summary?.total_labeled ?? 0;
  const canTrain = totalLabeled >= MIN_LABELS;
  const progress = Math.min(100, Math.round((totalLabeled / RECOMMENDED_LABELS) * 100));

  const fetchSummary = useCallback(() => {
    fetch(`${API_URL}/api/v1/slides/${slideId}/labels/summary`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data) setSummary(data);
      })
      .catch(() => {});
  }, [slideId]);

  useEffect(() => {
    fetchSummary();

    setLoadingPatches(true);
    fetch(`${API_URL}/api/v1/slides/${slideId}/patches?limit=50`)
      .then((r) => r.json())
      .then((data) => {
        setPatches(data);
        setLoadingPatches(false);
      })
      .catch(() => setLoadingPatches(false));
  }, [slideId, fetchSummary]);

  useEffect(() => {
    if (classifiers.length > 0 && !alClassifier) {
      setAlClassifier(classifiers[0].id);
    }
  }, [classifiers, alClassifier]);

  const labelPatch = async (patchId: string, label: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/slides/${slideId}/patches/${patchId}/label`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error("Failed to label patch");
      setLabeledMap((prev) => ({ ...prev, [patchId]: label }));
      fetchSummary();
    } catch {
      // silently fail for now
    }
  };

  const labelUncertainPatch = async (patchId: string, label: string) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/slides/${slideId}/patches/${patchId}/label`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error("Failed to label patch");
      setAlLabeledMap((prev) => ({ ...prev, [patchId]: label }));
      fetchSummary();
    } catch {
      // silently fail
    }
  };

  const addClass = () => {
    const trimmed = customClass.trim().toLowerCase();
    if (trimmed && !classes.includes(trimmed)) {
      setClasses((prev) => [...prev, trimmed]);
      setCustomClass("");
    }
  };

  const trainClassifier = async () => {
    if (!canTrain) return;
    setTraining(true);
    setTrainError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/classifiers/train`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trainingName.trim() || `Classifier from ${totalLabeled} labels`,
          description: `Trained on ${totalLabeled} doctor-labeled patches (interactive only)`,
          class_names: classes,
          label_source: "interactive",
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Error ${res.status}`);
      }
      const clf = await res.json();
      router.push(`/classifiers/${clf.id}`);
    } catch (err: any) {
      setTrainError(err.message || "Training failed to start");
    } finally {
      setTraining(false);
    }
  };

  const suggestUncertain = async () => {
    if (!alClassifier) return;
    setAlLoading(true);
    setAlError(null);
    setUncertainPatches([]);
    setAlLabeledMap({});
    try {
      const res = await fetch(`${API_URL}/api/v1/classifiers/${alClassifier}/active-learning`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slide_id: slideId, top_n: 20 }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Error ${res.status}`);
      }
      const data: UncertainPatch[] = await res.json();
      setUncertainPatches(data);
    } catch (err: any) {
      setAlError(err.message || "Failed to fetch uncertain patches");
    } finally {
      setAlLoading(false);
    }
  };

  const classColor = (cls: string) => {
    if (cls === "normal") return "bg-green-500 hover:bg-green-600";
    if (cls === "tumor") return "bg-red-500 hover:bg-red-600";
    return "bg-indigo-500 hover:bg-indigo-600";
  };

  const classColorLight = (cls: string) => {
    if (cls === "normal") return "text-green-700 bg-green-50";
    if (cls === "tumor") return "text-red-700 bg-red-50";
    return "text-indigo-700 bg-indigo-50";
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Patch Labeling</h2>
        <span className="text-xs text-gray-400">
          {totalLabeled} / {RECOMMENDED_LABELS} recommended
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              totalLabeled >= RECOMMENDED_LABELS ? "bg-green-500" : totalLabeled >= MIN_LABELS ? "bg-indigo-500" : "bg-amber-400"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {totalLabeled < MIN_LABELS
            ? `Need at least ${MIN_LABELS} labels to train (${totalLabeled} so far)`
            : totalLabeled < RECOMMENDED_LABELS
            ? `${totalLabeled} labels — enough to train. ~${RECOMMENDED_LABELS} recommended for good accuracy`
            : `${totalLabeled} labels — great coverage`}
        </p>
      </div>

      {/* Label Summary */}
      {summary && summary.total_labeled > 0 && (
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-500">Labels:</span>
          {Object.entries(summary.counts).map(([cls, count]) => (
            <span
              key={cls}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${classColorLight(cls)}`}
            >
              {cls}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Class selector and custom class input */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm text-gray-600">Active class:</span>
        {classes.map((cls) => (
          <button
            key={cls}
            onClick={() => setSelectedClass(cls)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              selectedClass === cls
                ? `${classColor(cls)} text-white`
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {cls}
          </button>
        ))}
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={customClass}
            onChange={(e) => setCustomClass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addClass()}
            placeholder="Add class..."
            className="border border-gray-300 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={addClass}
            disabled={!customClass.trim()}
            className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-40"
          >
            +
          </button>
        </div>
      </div>

      {/* Patch grid for labeling */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Select a class above, then click patches to label them
        </h3>
        {loadingPatches ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="animate-spin h-4 w-4 border-2 border-indigo-600 border-t-transparent rounded-full" />
            Loading patches...
          </div>
        ) : patches.length === 0 ? (
          <p className="text-sm text-gray-400">No patches available.</p>
        ) : (
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-[400px] overflow-y-auto">
            {patches.map((p) => {
              const label = labeledMap[p.id];
              return (
                <div key={p.id} className="relative group">
                  <button
                    onClick={() => labelPatch(p.id, selectedClass)}
                    className="w-full focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded"
                  >
                    <img
                      src={`${API_URL}/api/v1/slides/${slideId}/patches/${p.id}/image`}
                      alt={`Patch ${p.x},${p.y}`}
                      className={`w-full aspect-square object-cover rounded border-2 transition ${
                        label
                          ? label === "normal"
                            ? "border-green-500"
                            : label === "tumor"
                            ? "border-red-500"
                            : "border-indigo-500"
                          : "border-transparent hover:border-gray-400"
                      }`}
                      loading="lazy"
                    />
                  </button>
                  {label && (
                    <div
                      className={`absolute top-0 right-0 px-1 py-0.5 rounded-bl text-[8px] font-bold text-white ${
                        label === "normal"
                          ? "bg-green-500"
                          : label === "tumor"
                          ? "bg-red-500"
                          : "bg-indigo-500"
                      }`}
                    >
                      {label}
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-1 py-0.5 opacity-0 group-hover:opacity-100 transition text-center">
                    ({p.x}, {p.y})
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Inline Train Classifier */}
      <div className="border-t pt-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Train Classifier</h3>
          {canTrain && (
            <span className="text-xs text-green-600 font-medium">Ready to train</span>
          )}
        </div>
        {!canTrain ? (
          <p className="text-sm text-gray-400">
            Label at least {MIN_LABELS} patches to enable training ({totalLabeled} so far).
          </p>
        ) : (
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <label className="block text-xs text-gray-500 mb-1">Classifier name (optional)</label>
              <input
                type="text"
                value={trainingName}
                onChange={(e) => setTrainingName(e.target.value)}
                placeholder={`Classifier from ${totalLabeled} labels`}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={trainClassifier}
              disabled={training}
              className="px-5 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition font-medium flex items-center gap-2"
            >
              {training ? (
                <>
                  <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                  Training...
                </>
              ) : (
                <>
                  Train on {totalLabeled} labels
                </>
              )}
            </button>
          </div>
        )}
        {trainError && <p className="text-red-600 text-sm mt-2">{trainError}</p>}
      </div>

      {/* Active Learning Section */}
      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Active Learning</h3>
        <p className="text-xs text-gray-400 mb-3">
          Use a trained classifier to find the most uncertain patches. Label them to improve accuracy the most.
        </p>
        {classifiers.length === 0 ? (
          <p className="text-sm text-gray-400">
            Train a classifier first to use active learning.
          </p>
        ) : (
          <>
            <div className="flex items-end gap-3 mb-4">
              <div className="flex-1 max-w-xs">
                <label className="block text-xs text-gray-500 mb-1">Classifier</label>
                <select
                  value={alClassifier}
                  onChange={(e) => setAlClassifier(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {classifiers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={suggestUncertain}
                disabled={alLoading || !alClassifier}
                className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
              >
                {alLoading ? (
                  <>
                    <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                    Loading...
                  </>
                ) : (
                  "Suggest Uncertain Patches"
                )}
              </button>
            </div>

            {alError && <p className="text-red-600 text-sm mb-3">{alError}</p>}

            {uncertainPatches.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">
                  {uncertainPatches.length} most uncertain patches. Label them, then retrain for better accuracy.
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {uncertainPatches.map((up) => {
                    const label = alLabeledMap[up.patch_id];
                    const confidence = (up.max_probability * 100).toFixed(0);
                    return (
                      <div key={up.patch_id} className="relative">
                        <img
                          src={`${API_URL}/api/v1/slides/${slideId}/patches/${up.patch_id}/image`}
                          alt={`Patch ${up.x},${up.y}`}
                          className={`w-full aspect-square object-cover rounded border-2 ${
                            label
                              ? label === "normal"
                                ? "border-green-500"
                                : label === "tumor"
                                ? "border-red-500"
                                : "border-indigo-500"
                              : "border-amber-300"
                          }`}
                          loading="lazy"
                        />
                        {/* Confidence bar */}
                        <div className="mt-1 flex items-center gap-1">
                          <div className="flex-1 bg-gray-200 rounded-full h-1">
                            <div
                              className="bg-amber-400 h-1 rounded-full"
                              style={{ width: `${confidence}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-gray-400">{confidence}%</span>
                        </div>
                        <div className="text-[9px] text-gray-400 text-center mb-1">
                          pred: {up.predicted_label}
                        </div>
                        {/* Label buttons */}
                        {label ? (
                          <div
                            className={`text-center text-[10px] font-medium py-0.5 rounded ${classColorLight(label)}`}
                          >
                            {label}
                          </div>
                        ) : (
                          <div className="flex gap-0.5">
                            {classes.map((cls) => (
                              <button
                                key={cls}
                                onClick={() => labelUncertainPatch(up.patch_id, cls)}
                                className={`flex-1 text-[9px] text-white py-0.5 rounded transition ${classColor(cls)}`}
                              >
                                {cls}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* After labeling uncertain patches, prompt retrain */}
                {Object.keys(alLabeledMap).length > 0 && (
                  <div className="mt-4 bg-emerald-50 rounded-lg p-3 flex items-center justify-between">
                    <p className="text-sm text-emerald-800">
                      Labeled {Object.keys(alLabeledMap).length} uncertain patches. Retrain to improve accuracy.
                    </p>
                    <button
                      onClick={trainClassifier}
                      disabled={training}
                      className="px-4 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition font-medium"
                    >
                      {training ? "Training..." : "Retrain Now"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
