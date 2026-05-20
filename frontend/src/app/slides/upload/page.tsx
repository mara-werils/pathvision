"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function UploadPage() {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const router = useRouter();

  const handleUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API}/api/v1/slides/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const slide = await res.json();
      router.push(`/slides/${slide.id}`);
    } catch (err) {
      alert("Upload failed. Check the console for details.");
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Upload Slide</h1>

      <div
        className={`border-2 border-dashed rounded-lg p-16 text-center transition ${
          dragOver
            ? "border-indigo-500 bg-indigo-50"
            : "border-gray-300 bg-white"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) handleUpload(file);
        }}
      >
        {uploading ? (
          <p className="text-gray-500">Uploading...</p>
        ) : (
          <>
            <p className="text-gray-500 mb-4">
              Drag and drop a WSI file here, or click to browse
            </p>
            <input
              type="file"
              accept=".svs,.tiff,.tif,.ndpi,.mrxs,.png,.jpg,.jpeg"
              className="hidden"
              id="file-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
            <label
              htmlFor="file-input"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition cursor-pointer"
            >
              Choose File
            </label>
            <p className="text-xs text-gray-400 mt-4">
              Supported: .svs, .tiff, .ndpi, .mrxs, .png, .jpg
            </p>
          </>
        )}
      </div>
    </div>
  );
}
