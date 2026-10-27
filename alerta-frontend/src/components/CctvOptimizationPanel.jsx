import React, { useState } from "react";
import { optimizeCameras } from "../api/plannerPhase2";

export default function CctvOptimizationPanel({ projectId, imageUrl, analysis, onResult }) {
  const [budget, setBudget] = useState("1000");
  const [price, setPrice] = useState("120");
  const [fov, setFov] = useState("90");
  const [rangePx, setRangePx] = useState("400");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function run() {
    setLoading(true); setError(null);
    try {
      const res = await optimizeCameras(projectId, {
        budget,
        camera_config: {
          price: Number(price),
          fov_deg: Number(fov),
          max_range_px: Number(rangePx),
        },
      });
      const rj = res.result_json || res;
      setResult(rj);
      onResult?.(rj);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <h3>Camera optimization</h3>
      <div style={{ display: "grid", gap: 8,
                    gridTemplateColumns: "repeat(4, 1fr)", maxWidth: 720 }}>
        <label>Budget<input value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
        <label>Camera price<input value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label>FOV (deg)<input value={fov} onChange={(e) => setFov(e.target.value)} /></label>
        <label>Range (px)<input value={rangePx} onChange={(e) => setRangePx(e.target.value)} /></label>
      </div>
      <button onClick={run} disabled={loading} style={{ marginTop: 12 }}>
        {loading ? "Optimizing…" : "Run optimization"}
      </button>
      {error && <p style={{ color: "#b00" }}>{error}</p>}
      {result && (
        <div style={{ marginTop: 16 }}>
          <ul>
            <li>Cameras: {result.total_cameras}</li>
            <li>Total cost: {result.total_cost}</li>
            <li>Remaining budget: {result.remaining_budget}</li>
            <li>Coverage: {result.coverage_pct}%</li>
            <li>Critical coverage: {result.critical_coverage_pct}%</li>
            <li>Blind-spot sample points: {result.blind_spots?.length ?? 0}</li>
          </ul>
          {imageUrl && analysis && (
            <div style={{ position: "relative", maxWidth: "100%" }}>
              <img src={imageUrl} alt="Floor plan"
                   style={{ width: "100%", display: "block", opacity: 0.85 }} />
              <svg viewBox={`0 0 ${analysis.image_width} ${analysis.image_height}`}
                   preserveAspectRatio="none"
                   style={{ position: "absolute", top: 0, left: 0,
                            width: "100%", height: "100%", pointerEvents: "none" }}>
                {(result.selected_cameras || []).map((c) => (
                  <g key={c.id}>
                    <circle cx={c.x} cy={c.y} r={8}
                            fill="rgba(40,180,80,0.9)" stroke="#084" />
                    <line x1={c.x} y1={c.y}
                          x2={c.x + Math.cos((c.direction_deg * Math.PI) / 180) * (c.max_range_px || 100)}
                          y2={c.y + Math.sin((c.direction_deg * Math.PI) / 180) * (c.max_range_px || 100)}
                          stroke="rgba(40,180,80,0.6)" strokeDasharray="4 4" />
                  </g>
                ))}
              </svg>
            </div>
          )}
          {result.warnings?.length > 0 && (
            <ul style={{ color: "#a60", fontSize: 13 }}>
              {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
