import React, { useState } from "react";
import { optimizeCameras, analyzeFloorPlan } from "../api/plannerPhase2";

const inputCls =
  "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB]";
const btnCls =
  "px-4 py-2 rounded-xl bg-[#00C2CB] text-[#0B1F3A] text-sm font-semibold disabled:opacity-50 cursor-pointer";

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold text-[#0B1F3A]">{value}</div>
    </div>
  );
}

export default function CctvOptimizationPanel({
  projectId,
  floorPlanId,
  imageUrl,
  onResult,
}) {
  const [budget, setBudget] = useState("1000");
  const [price, setPrice] = useState("120");
  const [fov, setFov] = useState("90");
  const [rangeFrac, setRangeFrac] = useState("0.8");
  const [targetCov, setTargetCov] = useState("0.93");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null); // internal cache
  const [result, setResult] = useState(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      // 1. Analyse (only the first time)
      let a = analysis;
      if (!a) {
        const aRes = await analyzeFloorPlan(floorPlanId);
        a = aRes.result_json;
        setAnalysis(a);
      }
      // 2. Optimise with the current form values
      const res = await optimizeCameras(projectId, {
        budget,
        camera_config: {
          price: Number(price),
          fov_deg: Number(fov),
          range_frac: Number(rangeFrac),
          target_coverage: Number(targetCov),
        },
      });
      const rj = res.result_json || res;
      setResult(rj);
      onResult?.(rj);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const cameras = result?.cameras || [];
  const roomCov = result?.room_coverage || {};
  const imageToShow = result?.overlay_b64 || imageUrl;

  const buttonLabel = loading
    ? analysis
      ? "Optimizing…"
      : "Analyzing & optimizing…"
    : result
    ? "Re-run"
    : "Generate CCTV plan";

  return (
    <div className="space-y-4">
      {/* ── Form ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#0B1F3A]">Camera placement</h3>
          <span className="text-xs text-gray-500">
            Analysis + optimisation in one step
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm text-gray-600">
            Budget
            <input className={`${inputCls} mt-1`} value={budget}
                   onChange={(e) => setBudget(e.target.value)} />
          </label>
          <label className="text-sm text-gray-600">
            Camera price
            <input className={`${inputCls} mt-1`} value={price}
                   onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="text-sm text-gray-600">
            FOV (deg)
            <input className={`${inputCls} mt-1`} value={fov}
                   onChange={(e) => setFov(e.target.value)} />
          </label>
          <label className="text-sm text-gray-600">
            Range (frac)
            <input className={`${inputCls} mt-1`} value={rangeFrac}
                   onChange={(e) => setRangeFrac(e.target.value)} />
          </label>
          <label className="text-sm text-gray-600">
            Target cov.
            <input className={`${inputCls} mt-1`} value={targetCov}
                   onChange={(e) => setTargetCov(e.target.value)} />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button className={btnCls} onClick={run} disabled={loading}>
            {buttonLabel}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>

      {/* ── One image: preview before, overlay after ─────── */}
      <div className="bg-white rounded-2xl shadow-sm p-3">
        {imageToShow ? (
          <img
            src={imageToShow}
            alt={result ? "CCTV plan" : "Floor plan"}
            className="w-full max-h-[70vh] object-contain rounded-xl border border-gray-100 bg-gray-50"
          />
        ) : (
          <div className="p-12 text-center text-sm text-gray-500">
            Loading plan…
          </div>
        )}
      </div>

      {/* ── Results ──────────────────────────────────────── */}
      {result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Cameras" value={cameras.length} />
            <StatCard label="Total cost" value={result.total_cost ?? "—"} />
            <StatCard label="Remaining" value={result.remaining_budget ?? "—"} />
            <StatCard label="Coverage" value={`${result.coverage_pct ?? 0}%`} />
          </div>

          {cameras.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h4 className="font-semibold text-[#0B1F3A] text-sm">
                Placed cameras
              </h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {cameras.map((c) => (
                  <div key={c.id}
                       className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-[#0B1F3A]">
                        Cam {c.id}
                      </span>
                      <span className="text-xs text-gray-500">
                        ({c.position[0]}, {c.position[1]})
                      </span>
                    </div>
                    <div className="text-gray-600">
                      {c.angle_deg}° · +{c.new_coverage_pct}% new
                      {c.room_id ? ` · Room ${c.room_id}` : ""}
                      {c.range_m != null ? ` · ${c.range_m} m` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Object.keys(roomCov).length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h4 className="font-semibold text-[#0B1F3A] text-sm">
                Room coverage
              </h4>
              <div className="space-y-2">
                {Object.entries(roomCov).map(([rid, pct]) => (
                  <div key={rid} className="flex items-center gap-3 text-sm">
                    <span className="w-16 text-gray-600">Room {rid}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#00C2CB] rounded-full"
                           style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-12 text-right text-gray-600">
                      {pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.warnings?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
              <ul className="list-disc list-inside space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}