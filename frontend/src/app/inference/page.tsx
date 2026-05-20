"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";
import type { InferenceJob } from "@/lib/types";

export default function InferencePage() {
  const [jobs, setJobs] = useState<InferenceJob[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/inference`)
      .then((r) => r.json())
      .then(setJobs)
      .catch(() => []);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Inference Jobs</h1>

      {jobs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          No inference jobs yet. Run a classifier on a slide to see results.
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((j) => (
            <Link
              key={j.id}
              href={`/inference/${j.id}`}
              className="block bg-white rounded-lg shadow p-4 hover:bg-gray-50 transition"
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-medium text-sm">Job {j.id.slice(0, 8)}...</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Slide: {j.slide_id.slice(0, 8)} | Classifier: {j.classifier_id.slice(0, 8)}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 text-xs rounded-full ${
                    j.status === "complete"
                      ? "bg-green-100 text-green-700"
                      : j.status === "error"
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {j.status}
                </span>
              </div>
              {j.summary?.class_distribution && (
                <div className="flex gap-3 mt-2">
                  {Object.entries(j.summary.class_distribution).map(([name, count]) => (
                    <span key={name} className="text-xs bg-gray-100 rounded px-2 py-0.5">
                      {name}: {count}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
