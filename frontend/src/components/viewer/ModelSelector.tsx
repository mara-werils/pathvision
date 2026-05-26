"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

export type EmbeddingModel = {
  id: string;
  name: string;
  dim: number;
  framework: string;
  description: string;
  best_for: string[];
  installed: boolean;
};

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
}

export default function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [models, setModels] = useState<EmbeddingModel[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/embeddings/models`)
      .then((r) => r.json())
      .then(setModels)
      .catch(() => {});
  }, []);

  const selected = models.find((m) => m.id === value);

  if (models.length === 0) return null;

  return (
    <div className="relative">
      <label className="block text-xs text-gray-500 mb-1">Embedding model</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm flex items-center justify-between hover:border-gray-300 transition"
      >
        <span>
          {selected ? selected.name : "Select model"}
          {selected && (
            <span className="text-gray-400 ml-2 text-xs">{selected.dim}-dim</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {models.map((model) => (
            <button
              key={model.id}
              type="button"
              disabled={!model.installed}
              onClick={() => {
                if (model.installed) {
                  onChange(model.id);
                  setOpen(false);
                }
              }}
              className={`w-full text-left px-3 py-3 border-b last:border-b-0 transition ${
                model.installed
                  ? value === model.id
                    ? "bg-indigo-50"
                    : "hover:bg-gray-50"
                  : "opacity-50 cursor-not-allowed bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{model.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{model.dim}-dim</span>
                  {!model.installed && (
                    <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">
                      Coming soon
                    </span>
                  )}
                  {model.installed && value === model.id && (
                    <svg className="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{model.description}</p>
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {model.best_for.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
