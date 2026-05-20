"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import type { Classifier } from "@/lib/types";

export default function ClassifiersPage() {
  const [classifiers, setClassifiers] = useState<Classifier[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/classifiers`)
      .then((r) => r.json())
      .then(setClassifiers)
      .catch(() => []);
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Classifiers</h1>
        <Link
          href="/classifiers/new"
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
        >
          Train New Classifier
        </Link>
      </div>

      {classifiers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          No classifiers trained yet. Train one from labeled patches.
        </div>
      ) : (
        <div className="space-y-4">
          {classifiers.map((clf) => (
            <Link
              key={clf.id}
              href={`/classifiers/${clf.id}`}
              className="block bg-white rounded-lg shadow p-6 hover:bg-gray-50 transition"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-semibold">{clf.name}</h2>
                  {clf.description && (
                    <p className="text-sm text-gray-500 mt-1">{clf.description}</p>
                  )}
                  <div className="flex gap-4 mt-3 text-sm text-gray-600">
                    <span>Classes: {clf.class_names.join(", ")}</span>
                    <span>Samples: {clf.n_training_samples || "-"}</span>
                    {clf.metrics?.auc && (
                      <span className="text-indigo-600 font-semibold">
                        AUC: {clf.metrics.auc.toFixed(4)}
                      </span>
                    )}
                  </div>
                </div>
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
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
