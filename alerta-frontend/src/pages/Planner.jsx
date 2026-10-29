import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  apiErrorMessage, createProject, fetchFloorPlanImage,
  listFloorPlans, listProjects, uploadFloorPlan,
} from '../api/plannerApi';

// --- PHASE 2 IMPORTS ---
import CctvOptimizationPanel from '../components/CctvOptimizationPanel';


const MAX_MB = 20; // miroir de PLANNER_MAX_UPLOAD_MB ; le serveur reste l'autorité
const CURRENCIES = ['TND', 'EUR', 'USD'];
const inputCls =
  'w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB]';
const btnCls =
  'px-4 py-2 rounded-xl bg-[#00C2CB] text-[#0B1F3A] text-sm font-semibold disabled:opacity-50 cursor-pointer';

export default function Planner() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [floorPlans, setFloorPlans] = useState([]);
  const [activePlan, setActivePlan] = useState(null);
  const [image, setImage] = useState(null); // { id, url }
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ name: '', budget: '', currency: 'TND' });
  const [file, setFile] = useState(null);
  const [page, setPage] = useState(1);

  const imageUrl = image && activePlan && image.id === activePlan.id ? image.url : null;
  const selected = projects.find((p) => p.id === selectedId) || null;
  const fail = (err, fallback) => setMsg({ type: 'error', text: apiErrorMessage(err, fallback) });

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (err) {
      fail(err, 'Impossible de charger les projets.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((data) => !cancelled && setProjects(data))
      .catch((err) => !cancelled && fail(err, 'Impossible de charger les projets.'));
    return () => { cancelled = true; };
  }, []);

  // Charge les plans du projet sélectionné
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    listFloorPlans(selectedId)
      .then((plans) => {
        if (cancelled) return;
        setFloorPlans(plans);
        setActivePlan(plans[0] || null);
      })
      .catch((err) => !cancelled && fail(err, 'Impossible de charger les plans.'));
    return () => { cancelled = true; };
  }, [selectedId]);

  // Charge l'image privée du plan actif (avec JWT) et libère l'URL blob ensuite
  useEffect(() => {
    if (!activePlan) return;
    let url = null;
    let cancelled = false;
    fetchFloorPlanImage(activePlan.id)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImage({ id: activePlan.id, url });
      })
      .catch((err) => !cancelled && fail(err, "Impossible d'afficher l'image."));
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [activePlan]);

  const selectProject = (id) => {
    setFloorPlans([]);
    setActivePlan(null);
    setMsg({ type: '', text: '' });
    setSelectedId(id);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg({ type: '', text: '' });
    try {
      const project = await createProject({
        name: form.name,
        budget: form.budget === '' ? '0' : form.budget,
        currency: form.currency,
      });
      setForm({ name: '', budget: '', currency: form.currency });
      await loadProjects();
      selectProject(project.id);
      setMsg({ type: 'success', text: 'Projet créé.' });
    } catch (err) {
      fail(err, 'Création impossible.');
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setMsg({ type: '', text: '' });
    if (f && !f.name.toLowerCase().endsWith('.pdf')) {
      setFile(null);
      setMsg({ type: 'error', text: 'Veuillez choisir un fichier PDF.' });
      return;
    }
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setFile(null);
      setMsg({ type: 'error', text: `Fichier trop volumineux (maximum ${MAX_MB} Mo).` });
      return;
    }
    setFile(f);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || !selectedId) return;
    setBusy(true);
    setMsg({ type: '', text: '' });
    try {
      const plan = await uploadFloorPlan(selectedId, file, page);
      setFloorPlans((prev) => [plan, ...prev]);
      setActivePlan(plan);
      setFile(null);
      setPage(1);
      e.target.reset();
      loadProjects();
      setMsg({ type: 'success', text: 'Plan importé et converti en image.' });
    } catch (err) {
      fail(err, "Échec de l'import du PDF.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8]">
      <Navbar
        activeTab="planner"
        setActiveTab={(tab) => navigate(tab === 'admin_dashboard' ? '/admin' : '/dashboard')}
      />
      <main className="max-w-7xl mx-auto px-6 py-8 grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* ── Colonne gauche : création + liste des projets ── */}
        <section className="space-y-6">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <h2 className="font-bold text-[#0B1F3A]">Nouveau projet</h2>
            <input className={inputCls} placeholder="Nom (ex. Villa La Marsa)" required maxLength={120}
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="flex gap-2">
              <input className={inputCls} type="number" min="0" step="0.01" placeholder="Budget"
                value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
              <select className={`${inputCls} w-28`} value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <button className={btnCls} disabled={busy || !form.name.trim()}>Créer le projet</button>
          </form>

          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="font-bold text-[#0B1F3A] mb-3">Mes projets</h2>
            {projects.length === 0 && <p className="text-sm text-gray-500">Aucun projet pour l'instant.</p>}
            <ul className="space-y-2">
              {projects.map((p) => (
                <li key={p.id}>
                  <button onClick={() => selectProject(p.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm cursor-pointer border ${p.id === selectedId ? 'border-[#00C2CB] bg-[#00C2CB]/10' : 'border-gray-100 hover:bg-gray-50'}`}>
                    <span className="font-semibold text-[#0B1F3A]">{p.name}</span>
                    <span className="block text-xs text-gray-500">
                      {Number(p.budget).toLocaleString()} {p.currency} · {p.floor_plan_count} plan(s)
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Colonne droite : import PDF + aperçu + CCTV ── */}
        <section className="space-y-6">
          {msg.text && (
            <div role="alert" className={`rounded-xl px-4 py-3 text-sm font-medium ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {msg.text}
            </div>
          )}

          {!selected ? (
            <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-500 text-sm">
              Créez ou sélectionnez un projet pour importer le plan de la maison (PDF).
            </div>
          ) : (
            <>
              <form onSubmit={handleUpload} className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
                <h2 className="font-bold text-[#0B1F3A]">Importer un plan — {selected.name}</h2>
                <div className="flex flex-wrap gap-3 items-end">
                  <label className="text-sm text-gray-600 flex-1 min-w-[220px]">
                    Fichier PDF (max {MAX_MB} Mo)
                    <input className={`${inputCls} mt-1`} type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
                  </label>
                  <label className="text-sm text-gray-600 w-24">
                    Page
                    <input className={`${inputCls} mt-1`} type="number" min="1" value={page}
                      onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))} />
                  </label>
                  <button className={btnCls} disabled={busy || !file}>
                    {busy ? 'Import…' : 'Importer'}
                  </button>
                </div>
              </form>

              {activePlan && (
                <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
                  {floorPlans.length > 1 && (
                    <select className={inputCls} value={activePlan.id}
                      onChange={(e) => {
                        setActivePlan(floorPlans.find((f) => f.id === Number(e.target.value)));
                      }}>
                      {floorPlans.map((f) => (
                        <option key={f.id} value={f.id}>{f.original_filename} — page {f.selected_page}</option>
                      ))}
                    </select>
                  )}
                  <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><dt className="text-gray-500">Fichier</dt><dd className="font-semibold break-all">{activePlan.original_filename}</dd></div>
                    <div><dt className="text-gray-500">Pages (rendue)</dt><dd className="font-semibold">{activePlan.page_count} ({activePlan.selected_page})</dd></div>
                    <div><dt className="text-gray-500">Image</dt><dd className="font-semibold">{activePlan.image_width}×{activePlan.image_height}px</dd></div>
                    <div><dt className="text-gray-500">Taille</dt><dd className="font-semibold">{(activePlan.file_size / 1024).toFixed(0)} Ko</dd></div>
                  </dl>

                  {/* --- PHASE 2 UI: one-click analyze + optimize + overlay --- */}
                  <div className="border-t border-gray-100 pt-4">
                    <CctvOptimizationPanel
                      key={activePlan.id}
                      projectId={selectedId}
                      floorPlanId={activePlan.id}
                      imageUrl={imageUrl}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </main>
      
    </div>
  );
}