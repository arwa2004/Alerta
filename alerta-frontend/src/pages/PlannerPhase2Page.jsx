import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { analyzeFloorPlan, getFloorPlanAnalysis } from "../api/plannerPhase2";
import FloorPlanAnalysisViewer from "../components/FloorPlanAnalysisViewer";
import CctvOptimizationPanel from "../components/CctvOptimizationPanel";

export default function PlannerPhase2Page({ floorPlanId, imageUrl }) {
  const { projectId } = useParams();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!floorPlanId) return;
    getFloorPlanAnalysis(floorPlanId)
      .then((res) => setAnalysis(res.result_json))
      .catch(() => {});
  }, [floorPlanId]);

  async function runAnalysis() {
    setLoading(true); setError(null);
    try {
      const res = await analyzeFloorPlan(floorPlanId);
      setAnalysis(res.result_json);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Floor-plan analysis &amp; CCTV optimization</h2>
      <button onClick={runAnalysis} disabled={loading || !floorPlanId}>
        {loading ? "Analyzing…" : "Analyze floor plan"}
      </button>
      {error && <p style={{ color: "#b00" }}>{error}</p>}
      <FloorPlanAnalysisViewer imageUrl={imageUrl} analysis={analysis} />
      {analysis && (
        <CctvOptimizationPanel projectId={projectId}
                               imageUrl={imageUrl} analysis={analysis} />
      )}
    </div>
  );
}
