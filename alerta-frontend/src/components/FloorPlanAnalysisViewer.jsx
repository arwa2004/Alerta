import React from "react";

export default function FloorPlanAnalysisViewer({ analysis, overrideImage }) {
  const src = overrideImage || analysis?.cleaned_image_b64;
  if (!src) {
    return <div className="text-red-600 text-sm">No analysis available.</div>;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-3">
      <div className="text-sm font-semibold text-[#0B1F3A] mb-2">
        {overrideImage ? "Optimized Plan" : "Cleaned Floor Plan"}
      </div>
      <img
        src={src}
        alt="Floor plan"
        className="w-full max-h-[70vh] object-contain rounded-xl border border-gray-100 bg-gray-50"
      />
    </div>
  );
}