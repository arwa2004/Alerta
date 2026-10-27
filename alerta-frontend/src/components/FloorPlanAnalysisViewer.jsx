import React from "react";

export default function FloorPlanAnalysisViewer({ analysis }) {
  if (!analysis || !analysis.cleaned_image_b64) {
    return <div style={{ color: "#b00" }}>No analysis available.</div>;
  }

  return (
    <div style={{ position: "relative", maxWidth: "100%", background: "#fff", padding: "10px", borderRadius: "8px", textAlign: "center" }}>
      
      <div style={{ color: "#0B1F3A", fontWeight: "bold", marginBottom: "10px" }}>
        Cleaned Floor Plan
      </div>

      {/* Display only the clean image */}
      <img 
        src={analysis.cleaned_image_b64} 
        alt="Cleaned Floor Plan" 
        style={{ width: "100%", display: "block", border: "1px solid #ccc" }} 
      />
      
    </div>
  );
}