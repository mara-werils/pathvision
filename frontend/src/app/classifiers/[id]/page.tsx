"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import type { Classifier } from "@/lib/types";
import ROCChart from "@/components/classifiers/ROCChart";
import ConfusionMatrix from "@/components/classifiers/ConfusionMatrix";

export default function ClassifierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [clf, setClf] = useState<Classifier | null>(null);

  useEffect(() => {
    const poll = async () => {
      const res = await fetch(`${API_URL}/api/v1/classifiers/${id}`);
      const data = await res.json();
      setClf(data);
      if (data.status === "training") {
        setTimeout(poll, 3000);
      }
    };
    poll();
  }, [id]);

  if (!clf) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div>
      <Link href="/classifiers" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Classifiers
      </Link>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold">{clf.name}</h1>
          {clf.description && <p className="text-sm text-gray-500 mt-1">{clf.description}</p>}
        </div>
        <div className="flex items-center gap-3">
          {clf.status === "ready" && (
            <a
              href={`${API_URL}/api/v1/classifiers/${id}/export/model`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" /></svg>
              Export Model (.joblib)
            </a>
          )}
          <span
            className={`px-3 py-1 text-sm rounded-full ${
              clf.status === "ready"
                ? "bg-green-100 text-green-700"
                : clf.status === "error"
                ? "bg-red-100 text-red-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {clf.status}
          </span>
        </div>
      </div>

      {clf.status === "training" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
          <p className="text-yellow-800">Training in progress...</p>
        </div>
      )}

      {clf.metrics && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-xs text-gray-500">AUC</p>
              <p className="text-3xl font-bold text-indigo-600">
                {clf.metrics.auc?.toFixed(4) || "-"}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-xs text-gray-500">Training Samples</p>
              <p className="text-3xl font-bold">{clf.n_training_samples || "-"}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-xs text-gray-500">Classes</p>
              <p className="text-3xl font-bold">{clf.n_classes}</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {clf.metrics.roc_data?.fpr && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-3">ROC Curve</h2>
                <ROCChart fpr={clf.metrics.roc_data.fpr} tpr={clf.metrics.roc_data.tpr} />
              </div>
            )}
            {clf.metrics.confusion_matrix && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-3">Confusion Matrix</h2>
                <ConfusionMatrix
                  matrix={clf.metrics.confusion_matrix}
                  labels={clf.class_names}
                />
              </div>
            )}
          </div>

          {/* Class distribution */}
          {clf.metrics.class_distribution && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold mb-3">Class Distribution</h2>
              <div className="flex gap-4">
                {Object.entries(clf.metrics.class_distribution).map(([name, count]) => (
                  <div key={name} className="bg-gray-50 rounded-lg px-4 py-2">
                    <span className="font-medium">{name}</span>:{" "}
                    <span className="text-gray-600">{count} samples</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Classification report */}
          {clf.metrics.classification_report && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-3">Classification Report</h2>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2">Class</th>
                    <th className="text-left px-3 py-2">Precision</th>
                    <th className="text-left px-3 py-2">Recall</th>
                    <th className="text-left px-3 py-2">F1</th>
                    <th className="text-left px-3 py-2">Support</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {clf.class_names.map((name) => {
                    const row = clf.metrics?.classification_report?.[name];
                    if (!row) return null;
                    return (
                      <tr key={name}>
                        <td className="px-3 py-2 font-medium">{name}</td>
                        <td className="px-3 py-2">{row.precision?.toFixed(4)}</td>
                        <td className="px-3 py-2">{row.recall?.toFixed(4)}</td>
                        <td className="px-3 py-2">{row["f1-score"]?.toFixed(4)}</td>
                        <td className="px-3 py-2">{row.support}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
