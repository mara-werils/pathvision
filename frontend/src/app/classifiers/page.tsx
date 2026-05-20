"use client";

import Link from "next/link";

export default function ClassifiersPage() {
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
      <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
        No classifiers trained yet. Train one from labeled patches.
      </div>
    </div>
  );
}
