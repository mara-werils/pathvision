"use client";

import { useState } from "react";
import { API_URL } from "@/lib/api";

interface ClassDistItem {
  class: string;
  count: number;
  percentage: number;
}

interface ReportData {
  title: string;
  report_id: string;
  generated_at: string;
  specimen: {
    filename: string;
    dimensions: string;
    magnification: string;
    vendor: string;
  };
  analysis: {
    classifier: string;
    classifier_auc: number | null;
    total_patches: number;
    embedding_model: string;
  };
  findings: {
    primary_diagnosis: string;
    tumor_percentage: number | null;
    tumor_regions: number;
    class_distribution: ClassDistItem[];
    confidence: {
      mean: number;
      median: number;
      min: number;
      max: number;
      std: number;
    };
  };
  quality: {
    embedding_model: string;
    classifier_metrics: {
      auc: number | null;
      f1_weighted: number | null;
    };
  };
  disclaimer: string;
}

export default function ReportPanel({ jobId }: { jobId: string }) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/inference/${jobId}/report`);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body);
      }
      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const fmtNum = (v: number | null | undefined, decimals = 4) =>
    v != null ? v.toFixed(decimals) : "N/A";

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">
          AI Pathology Report
        </h2>
        <div className="flex gap-2">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            )}
            {report ? "Refresh Report" : "Generate Report"}
          </button>
          {report && (
            <a
              href={`${API_URL}/api/v1/inference/${jobId}/export/report`}
              download
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3"
                />
              </svg>
              Download PDF
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {!report && !loading && !error && (
        <div className="px-6 py-12 text-center text-gray-400 text-sm">
          Click &quot;Generate Report&quot; to create an AI-assisted pathology
          analysis report.
        </div>
      )}

      {report && (
        <div className="px-6 py-5 space-y-6">
          {/* Title */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">
              Report ID: {report.report_id}
            </p>
            <p className="text-xs text-gray-400">
              Generated: {report.generated_at.slice(0, 19).replace("T", " ")}{" "}
              UTC
            </p>
          </div>

          {/* Specimen Information */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Specimen Information
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoField label="Slide Filename" value={report.specimen.filename} />
              <InfoField label="Image Dimensions" value={`${report.specimen.dimensions} px`} />
              <InfoField label="Magnification" value={report.specimen.magnification} />
              <InfoField label="Scanner Vendor" value={report.specimen.vendor} />
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* AI Analysis */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              AI Analysis Parameters
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <InfoField label="Classifier" value={report.analysis.classifier} />
              <InfoField label="Classifier AUC" value={fmtNum(report.analysis.classifier_auc)} />
              <InfoField
                label="Total Patches"
                value={report.analysis.total_patches.toLocaleString()}
              />
              <InfoField label="Embedding Model" value={report.analysis.embedding_model} />
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* Findings */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Findings
            </h3>

            {/* Primary diagnosis highlight */}
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                Primary Assessment
              </p>
              <p className="text-base font-semibold text-gray-900">
                {report.findings.primary_diagnosis}
              </p>
              {report.findings.tumor_percentage != null && (
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-gray-900">
                    {report.findings.tumor_percentage.toFixed(1)}%
                  </span>
                  <span className="text-sm text-gray-500">
                    of tissue classified as tumor
                  </span>
                </div>
              )}
              {report.findings.tumor_regions > 0 && (
                <p className="mt-2 text-sm text-gray-600">
                  Tumor tissue distributed across{" "}
                  <span className="font-medium">
                    {report.findings.tumor_regions}
                  </span>{" "}
                  distinct region(s).
                </p>
              )}
            </div>

            {/* Class distribution table */}
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wider mb-2">
              Class Distribution
            </p>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="text-left px-3 py-2 font-medium">Class</th>
                  <th className="text-center px-3 py-2 font-medium">
                    Patch Count
                  </th>
                  <th className="text-center px-3 py-2 font-medium">
                    Percentage
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.findings.class_distribution.map((item) => (
                  <tr key={item.class} className="hover:bg-gray-50">
                    <td className="px-3 py-2 capitalize">{item.class}</td>
                    <td className="px-3 py-2 text-center">
                      {item.count.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {item.percentage.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-medium">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-center">
                    {report.analysis.total_patches.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-center">100.0%</td>
                </tr>
              </tbody>
            </table>

            {/* Confidence stats */}
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wider mb-2">
              Prediction Confidence
            </p>
            <div className="grid grid-cols-5 gap-2">
              <StatCard
                label="Mean"
                value={report.findings.confidence.mean}
              />
              <StatCard
                label="Median"
                value={report.findings.confidence.median}
              />
              <StatCard
                label="Min"
                value={report.findings.confidence.min}
              />
              <StatCard
                label="Max"
                value={report.findings.confidence.max}
              />
              <StatCard
                label="Std Dev"
                value={report.findings.confidence.std}
              />
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* Quality Metrics */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Quality Metrics
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <InfoField
                label="Embedding Model"
                value={report.quality.embedding_model}
              />
              <InfoField
                label="Classifier AUC"
                value={fmtNum(report.quality.classifier_metrics.auc)}
              />
              <InfoField
                label="Weighted F1"
                value={fmtNum(report.quality.classifier_metrics.f1_weighted)}
              />
            </div>
          </section>

          <hr className="border-gray-100" />

          {/* Disclaimer */}
          <p className="text-xs text-gray-400 italic leading-relaxed">
            {report.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900 mt-0.5">
        {value.toFixed(4)}
      </p>
    </div>
  );
}
