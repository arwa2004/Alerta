import { useState } from 'react';
import { zonesApi, extractError } from '../../api/recognitionApi';
import { Modal, Banner, EmptyState } from './ui';
import { inputCls, labelCls, primaryBtn, ghostBtn, dangerBtn } from './styles';

const EMPTY = { name: '', description: '', camera_source: '', threshold: 0.5, is_active: true };

function sensitivityLabel(t) {
  if (t <= 0.42) return 'Très strict : peu de faux positifs, mais des personnes connues peuvent être manquées.';
  if (t <= 0.55) return 'Équilibré : recommandé pour la plupart des usages.';
  return 'Permissif : reconnaît plus facilement, au risque de confondre deux personnes.';
}

function ZoneForm({ zone, onClose, onSaved }) {
  const [form, setForm] = useState(zone ? { ...EMPTY, ...zone } : EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        name: form.name, description: form.description, camera_source: form.camera_source,
        threshold: Number(form.threshold), is_active: form.is_active,
      };
      await (zone ? zonesApi.update(zone.id, payload) : zonesApi.create(payload));
      onSaved();
    } catch (err) {
      setError(extractError(err, "Impossible d'enregistrer la zone."));
      setSaving(false);
    }
  };

  return (
    <Modal title={zone ? 'Modifier la zone' : 'Nouvelle zone'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Banner>{error}</Banner>
        <div>
          <label className={labelCls} htmlFor="z-name">Nom de la zone</label>
          <input id="z-name" required maxLength={120} className={inputCls} placeholder="Maison, Bureau, Garage"
            value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="z-desc">Description</label>
          <textarea id="z-desc" rows={2} className={inputCls} value={form.description}
            onChange={(e) => set('description', e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="z-cam">Caméra</label>
          <input id="z-cam" className={inputCls} placeholder="0, ou rtsp://192.168.1.20/stream"
            value={form.camera_source} onChange={(e) => set('camera_source', e.target.value)} />
          <p className="text-[11px] text-gray-400 mt-1">Numéro de caméra locale ou adresse du flux vidéo.</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="z-th">
            Seuil de reconnaissance : <span className="font-mono">{Number(form.threshold).toFixed(2)}</span>
          </label>
          <input id="z-th" type="range" min="0.3" max="0.7" step="0.01" className="w-full accent-[#00838F]"
            value={form.threshold} onChange={(e) => set('threshold', e.target.value)} />
          <p className="text-[11px] text-[#4A5568] mt-1">{sensitivityLabel(Number(form.threshold))}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#4A5568] cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-[#00838F]" checked={form.is_active}
            onChange={(e) => set('is_active', e.target.checked)} />
          Zone active (la reconnaissance est suspendue si décochée)
        </label>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className={`flex-1 ${ghostBtn}`}>Annuler</button>
          <button type="submit" disabled={saving} className={`flex-1 ${primaryBtn}`}>
            {saving ? 'Enregistrement...' : 'Enregistrer la zone'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function ZonesPanel({ zones, loading, onChanged }) {
  const [editing, setEditing] = useState(null);     // null | 'new' | zone
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');

  const toggleActive = async (z) => {
    setError('');
    try { await zonesApi.update(z.id, { is_active: !z.is_active }); onChanged(); }
    catch (err) { setError(extractError(err)); }
  };

  const confirmDelete = async () => {
    try { await zonesApi.remove(deleting.id); setDeleting(null); onChanged(); }
    catch (err) { setError(extractError(err)); setDeleting(null); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#4A5568]">Chaque zone a sa caméra et son propre seuil de sensibilité.</p>
        <button type="button" onClick={() => setEditing('new')} className={primaryBtn}>Créer une zone</button>
      </div>
      <Banner>{error}</Banner>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement des zones...</p>
      ) : zones.length === 0 ? (
        <EmptyState
          title="Aucune zone pour le moment"
          hint="Créez une première zone (par exemple « Maison »), puis ajoutez-y les personnes que la caméra doit reconnaître."
          action={<button type="button" onClick={() => setEditing('new')} className={primaryBtn}>Créer ma première zone</button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {zones.map((z) => (
            <div key={z.id} className="bg-white rounded-3xl border border-[#D8DEE4] p-6 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-[#0B1F3A] truncate">{z.name}</h3>
                  <p className="text-xs text-[#4A5568] mt-0.5 line-clamp-2">{z.description || 'Aucune description'}</p>
                </div>
                <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  z.is_active ? 'bg-[#2BB673]/15 text-[#1D8A57]' : 'bg-gray-100 text-gray-500'}`}>
                  {z.is_active ? 'Active' : 'Suspendue'}
                </span>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-xs">
                <div><dt className="text-[#8FA3B8]">Personnes</dt><dd className="font-bold text-[#0B1F3A] text-base">{z.persons_count}</dd></div>
                <div><dt className="text-[#8FA3B8]">Seuil</dt><dd className="font-bold text-[#0B1F3A] text-base font-mono">{z.threshold.toFixed(2)}</dd></div>
                <div className="min-w-0"><dt className="text-[#8FA3B8]">Caméra</dt><dd className="font-semibold text-[#0B1F3A] truncate">{z.camera_source || 'Non définie'}</dd></div>
              </dl>
              <div className="flex gap-2 pt-3 border-t border-[#E7EBEF]">
                <button type="button" onClick={() => setEditing(z)} className={ghostBtn}>Modifier</button>
                <button type="button" onClick={() => toggleActive(z)} className={ghostBtn}>
                  {z.is_active ? 'Suspendre' : 'Réactiver'}
                </button>
                <button type="button" onClick={() => setDeleting(z)}
                  className="ml-auto px-4 py-2.5 text-xs font-bold text-[#C22B36] hover:bg-red-50 rounded-xl cursor-pointer">
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ZoneForm zone={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }} />
      )}

      {deleting && (
        <Modal title={`Supprimer « ${deleting.name} » ?`} onClose={() => setDeleting(null)}>
          <p className="text-sm text-[#4A5568] mb-5">
            La zone est supprimée. Les personnes qui y étaient rattachées sont conservées (avec leurs photos),
            mais ne seront plus reconnues dans cette zone.
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setDeleting(null)} className={`flex-1 ${ghostBtn}`}>Annuler</button>
            <button type="button" onClick={confirmDelete} className={`flex-1 ${dangerBtn}`}>Supprimer la zone</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
