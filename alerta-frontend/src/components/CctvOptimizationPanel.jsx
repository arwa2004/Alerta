import React, { useState } from "react";
import { optimizeCameras, analyzeFloorPlan, fetchSecurityAudit } from "../api/plannerPhase2";
import DigitalTwinMap from './DigitalTwinMap';

const inputCls =
  "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB]";
const btnCls =
  "px-4 py-2 rounded-xl bg-[#00C2CB] text-[#0B1F3A] text-sm font-semibold disabled:opacity-50 cursor-pointer";
const btnAuditCls =
  "px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 cursor-pointer shadow-sm";

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
  const [analysis, setAnalysis] = useState(null);
  const [result, setResult] = useState(null);

  // États pour l'Audit de Sécurité
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);
  const [auditResult, setAuditResult] = useState(null);

  // NOUVEAU : État pour basculer entre l'image d'optimisation et l'image d'audit
  const [viewMode, setViewMode] = useState('optimization'); // 'optimization' | 'audit'

  async function run() {
    setLoading(true);
    setError(null);
    setViewMode('optimization'); // On bascule sur la vue CCTV
    try {
      let a = analysis;
      if (!a) {
        const aRes = await analyzeFloorPlan(floorPlanId);
        a = aRes.result_json;
        setAnalysis(a);
      }
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

  async function runAudit() {
    setAuditLoading(true);
    setAuditError(null);
    setAuditResult(null);
    setViewMode('audit'); // On bascule sur la vue Audit
    try {
      const data = await fetchSecurityAudit(floorPlanId);
      setAuditResult(data);
    } catch (e) {
      console.error("Erreur Audit:", e);
      setAuditError(e.response?.data?.detail || e.message);
    } finally {
      setAuditLoading(false);
    }
  }

  const cameras = result?.cameras || [];
  const roomCov = result?.room_coverage || {};

  // L'image dépend maintenant du viewMode sélectionné
  const imageToShow = viewMode === 'audit' && auditResult?.overlay_b64
    ? auditResult.overlay_b64
    : (result?.overlay_b64 || imageUrl);

  const buttonLabel = loading
    ? analysis ? "Optimizing…" : "Analyzing & optimizing…"
    : result ? "Re-run" : "Generate CCTV plan";

  const getScoreColor = (level) => {
    if (level === 'critical' || level === 'high') return 'text-red-600 bg-red-50 border-red-200';
    if (level === 'moderate') return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  return (
    <div className="space-y-4">
      {/* ── Formulaire et Boutons ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[#0B1F3A]">Camera placement & Security Audit</h3>
          <span className="text-xs text-gray-500">Analyse et optimisation</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm text-gray-600">
            Budget
            <input className={`${inputCls} mt-1`} value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <label className="text-sm text-gray-600">
            Camera price
            <input className={`${inputCls} mt-1`} value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="text-sm text-gray-600">
            FOV (deg)
            <input className={`${inputCls} mt-1`} value={fov} onChange={(e) => setFov(e.target.value)} />
          </label>
          <label className="text-sm text-gray-600">
            Range (frac)
            <input className={`${inputCls} mt-1`} value={rangeFrac} onChange={(e) => setRangeFrac(e.target.value)} />
          </label>
          <label className="text-sm text-gray-600">
            Target cov.
            <input className={`${inputCls} mt-1`} value={targetCov} onChange={(e) => setTargetCov(e.target.value)} />
          </label>
        </div>

        {/* BOUTONS */}
        <div className="flex items-center gap-3 flex-wrap">
          <button className={btnCls} onClick={run} disabled={loading || auditLoading}>
            {buttonLabel}
          </button>

          <button className={btnAuditCls} onClick={runAudit} disabled={loading || auditLoading}>
            {auditLoading ? "Audit en cours…" : "Lancer l'Audit de Sécurité"}
          </button>

          {error && <span className="text-sm text-red-600 font-medium">{error}</span>}
          {auditError && <span className="text-sm text-red-600 font-medium">{auditError}</span>}
        </div>
      </div>

      {/* ── Onglets de sélection de vue ───────────────────────────────────── */}
      {(result || auditResult) && (
        <div className="flex gap-2">
          {result && (
            <button
              onClick={() => setViewMode('optimization')}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition cursor-pointer ${viewMode === 'optimization' ? 'bg-[#0B1F3A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              📷 Vue Caméras (CCTV)
            </button>
          )}
          {auditResult && (
            <button
              onClick={() => setViewMode('audit')}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition cursor-pointer ${viewMode === 'audit' ? 'bg-red-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              🛡️ Vue Audit (Risques)
            </button>
          )}
        </div>
      )}

      {/* ── Image du plan (ou Overlay) ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm p-3">
        {imageToShow ? (
          <img
            src={imageToShow}
            alt="Plan"
            className="w-full max-h-[70vh] object-contain rounded-xl border border-gray-100 bg-gray-50"
          />
        ) : (
          <div className="p-12 text-center text-sm text-gray-500">Loading plan…</div>
        )}
      </div>

      {/* ── RÉSULTATS DE L'AUDIT DE SÉCURITÉ ──────────────────────────────── */}
      {viewMode === 'audit' && auditResult && (
        <div className="space-y-4 animate-in fade-in duration-500">
          <div className={`rounded-2xl p-5 border ${getScoreColor(auditResult.risk_level)}`}>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold">Rapport d'Audit de Sécurité</h3>
                <p className="text-sm opacity-80 mt-1">{auditResult.scoring_explanation}</p>
              </div>
              <div className="text-center bg-white/50 rounded-xl px-4 py-2">
                <div className="text-3xl font-extrabold">{auditResult.risk_score}<span className="text-lg opacity-50">/100</span></div>
                <div className="text-xs font-bold uppercase tracking-wider mt-1">{auditResult.risk_level}</div>
              </div>
            </div>
          </div>

          {auditResult.risks?.length > 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h4 className="font-semibold text-[#0B1F3A] text-sm">Failles détectées ({auditResult.risks.length})</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {auditResult.risks.map((risk, idx) => (
                  <div key={idx} className="border border-gray-100 bg-gray-50 rounded-xl p-4 text-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${risk.severity === 'high' ? 'bg-red-100 text-red-700' :
                          risk.severity === 'medium' ? 'bg-orange-100 text-orange-700' :
                            'bg-green-100 text-green-700'
                        }`}>
                        {risk.severity}
                      </span>
                      <span className="font-bold text-[#0B1F3A]">{risk.title}</span>
                    </div>
                    <p className="text-gray-600 mb-2">{risk.explanation}</p>
                    <div className="bg-[#00C2CB]/10 text-[#00838F] p-2 rounded-lg text-xs font-medium border border-[#00C2CB]/20">
                      💡 <strong>Recommandation :</strong> {risk.recommendation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-2xl p-5 text-sm font-medium">
              ✅ Aucun risque majeur détecté sur ce plan.
            </div>
          )}
        </div>
      )}

      {/* ── DIGITAL TWIN ─────────────────────────────────────────────────── */}
      {viewMode === 'optimization' && analysis && (
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4 border-2 border-[#00C2CB]/30 mt-6 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#0B1F3A]">Security Digital Twin (Simulation)</h3>
          </div>
          <DigitalTwinMap analysisResult={analysis} />
        </div>
      )}

      {/* ── RÉSULTATS CCTV OPTIMIZER ─────────────────────────────────────── */}
      {viewMode === 'optimization' && result && (
        <div className="space-y-4 mt-6 border-t border-gray-200 pt-6 animate-in fade-in">
          <h3 className="font-bold text-[#0B1F3A] text-lg">Résultats de l'Optimisation CCTV</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Cameras" value={cameras.length} />
            <StatCard label="Total cost" value={result.total_cost ?? "—"} />
            <StatCard label="Remaining" value={result.remaining_budget ?? "—"} />
            <StatCard label="Coverage" value={`${result.coverage_pct ?? 0}%`} />
          </div>

          {cameras.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h4 className="font-semibold text-[#0B1F3A] text-sm">Placed cameras</h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {cameras.map((c) => (
                  <div key={c.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-[#0B1F3A]">Cam {c.id}</span>
                      <span className="text-xs text-gray-500">({c.position[0]}, {c.position[1]})</span>
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
        </div>
      )}
    </div>
  );
}