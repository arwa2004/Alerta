import { useEffect, useMemo, useState } from 'react';
import { personsApi, extractError } from '../../api/recognitionApi';
import AuthImage from '../AuthImage';
import { Modal, Banner, EmptyState } from './ui';
import { STATUS, inputCls, labelCls, primaryBtn, ghostBtn, dangerBtn } from './styles';

const MIN_PHOTOS = 3;

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toIso = (local) => (local ? new Date(local).toISOString() : null);

function validityBadge(p) {
  const now = Date.now();
  if (p.valid_from && new Date(p.valid_from) > now) return { text: 'Pas encore valide', cls: 'bg-gray-100 text-gray-500' };
  if (p.valid_to && new Date(p.valid_to) < now) return { text: 'Accès expiré', cls: 'bg-red-50 text-[#C22B36]' };
  if (p.valid_to) return { text: `Jusqu'au ${new Date(p.valid_to).toLocaleDateString('fr-FR')}`, cls: 'bg-[#E4F8F9] text-[#00838F]' };
  return null;
}

function PhotoPicker({ files, setFiles, min }) {
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-bold text-[#0B1F3A]" htmlFor="p-files">Photos du visage</label>
        {min > 0 && (
          <span className={`text-[11px] font-semibold ${files.length >= min ? 'text-[#1D8A57]' : 'text-[#B4702F]'}`}>
            {files.length} / {min} minimum
          </span>
        )}
      </div>
      <input id="p-files" type="file" accept="image/jpeg,image/png,image/webp" multiple
        onChange={(e) => setFiles([...files, ...Array.from(e.target.files)])}
        className="block w-full text-xs text-[#4A5568] file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-[#E4F8F9] file:text-[#00838F] file:font-bold file:cursor-pointer" />
      <p className="text-[11px] text-gray-400 mt-1">
        Un seul visage par photo, de face ou légèrement de profil, bien éclairé et net. Variez les angles et les expressions.
      </p>
      {files.length > 0 && (
        <div className="grid grid-cols-5 gap-2 mt-3">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="relative group">
              <img src={previews[i]} alt={`Photo ${i + 1}`} className="w-full aspect-square object-cover rounded-xl border border-[#D8DEE4]" />
              <button type="button" aria-label={`Retirer la photo ${i + 1}`}
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#E63946] text-white text-[10px] cursor-pointer">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonModal({ person, zones, onClose, onSaved }) {
  const isEdit = !!person;
  const [form, setForm] = useState({
    full_name: person?.full_name || '',
    status: person?.status || 'authorized',
    relation: person?.relation || '',
    consent: person?.consent ?? false,
    valid_from: toLocalInput(person?.valid_from),
    valid_to: toLocalInput(person?.valid_to),
    zones: person?.zones || [],
  });
  const [files, setFiles] = useState([]);
  const [faces, setFaces] = useState(person?.faces || []);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleZone = (id) => set('zones', form.zones.includes(id) ? form.zones.filter((z) => z !== id) : [...form.zones, id]);

  const removeFace = async (faceId) => {
    setError('');
    try {
      await personsApi.removeFace(person.id, faceId);
      setFaces((fs) => fs.filter((f) => f.id !== faceId));
    } catch (err) { setError(extractError(err)); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isEdit && files.length < MIN_PHOTOS) {
      setError(`Ajoutez au moins ${MIN_PHOTOS} photos (${files.length} sélectionnée${files.length > 1 ? 's' : ''}).`);
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await personsApi.update(person.id, {
          full_name: form.full_name, status: form.status, relation: form.relation,
          consent: form.consent, zones: form.zones,
          valid_from: toIso(form.valid_from), valid_to: toIso(form.valid_to),
        });
        if (files.length) await personsApi.addFaces(person.id, files);
      } else {
        const fd = new FormData();
        fd.append('full_name', form.full_name);
        fd.append('status', form.status);
        fd.append('relation', form.relation);
        fd.append('consent', form.consent ? 'true' : 'false');
        if (form.valid_from) fd.append('valid_from', toIso(form.valid_from));
        if (form.valid_to) fd.append('valid_to', toIso(form.valid_to));
        form.zones.forEach((z) => fd.append('zones', z));
        files.forEach((f) => fd.append('images', f));
        await personsApi.create(fd);
      }
      onSaved();
    } catch (err) {
      setError(extractError(err, "Impossible d'enregistrer la personne."));
      setSaving(false);
    }
  };

  return (
    <Modal wide title={isEdit ? `Modifier ${person.full_name}` : 'Ajouter une personne'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <Banner>{error}</Banner>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls} htmlFor="p-name">Nom complet</label>
            <input id="p-name" required className={inputCls} value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="p-rel">Lien (famille, employé...)</label>
            <input id="p-rel" className={inputCls} value={form.relation} onChange={(e) => set('relation', e.target.value)} />
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="p-status">Statut</label>
          <select id="p-status" className={inputCls} value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="authorized">Autorisée : jamais d'alerte dans ses zones</option>
            <option value="visitor">Visiteur : reconnu, accès temporaire</option>
            <option value="watched">Surveillée : alerte à chaque détection</option>
          </select>
        </div>

        <fieldset>
          <legend className={labelCls}>Zones où la personne est reconnue</legend>
          {zones.length === 0 ? (
            <p className="text-xs text-[#B4702F]">Créez d'abord une zone dans l'onglet « Zones ».</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {zones.map((z) => (
                <label key={z.id} className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border cursor-pointer select-none transition ${
                  form.zones.includes(z.id)
                    ? 'bg-[#0B1F3A] text-[#00C2CB] border-[#0B1F3A]'
                    : 'bg-white text-[#4A5568] border-[#D8DEE4] hover:border-[#00C2CB]'}`}>
                  <input type="checkbox" className="sr-only" checked={form.zones.includes(z.id)} onChange={() => toggleZone(z.id)} />
                  {z.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls} htmlFor="p-from">Valide à partir du</label>
            <input id="p-from" type="datetime-local" className={inputCls} value={form.valid_from} onChange={(e) => set('valid_from', e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="p-to">Valide jusqu'au</label>
            <input id="p-to" type="datetime-local" className={inputCls} value={form.valid_to} onChange={(e) => set('valid_to', e.target.value)} />
          </div>
        </div>
        <p className="text-[11px] text-gray-400 -mt-3">Laissez vide pour un accès sans limite. Hors période, la personne est traitée comme inconnue.</p>

        {isEdit && faces.length > 0 && (
          <div>
            <p className={labelCls}>Photos enregistrées ({faces.length})</p>
            <div className="grid grid-cols-5 gap-2">
              {faces.map((f) => (
                <div key={f.id} className="relative">
                  <AuthImage src={f.image_url} alt="Visage enregistré" className="w-full aspect-square object-cover rounded-xl border border-[#D8DEE4]" />
                  <button type="button" aria-label="Supprimer cette photo" onClick={() => removeFace(f.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#E63946] text-white text-[10px] cursor-pointer">✕</button>
                  <span className="absolute bottom-1 left-1 px-1.5 rounded bg-[#0B1F3A]/70 text-white text-[10px] font-mono">{Math.round(f.quality_score)}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Le chiffre indique la qualité de la photo (sur 100). Minimum {MIN_PHOTOS} photos à conserver.</p>
          </div>
        )}

        <PhotoPicker files={files} setFiles={setFiles} min={isEdit ? 0 : MIN_PHOTOS} />

        <div className="p-4 rounded-2xl bg-[#F4F6F8] border border-[#E7EBEF]">
          <label className="flex items-start gap-3 text-sm text-[#0B1F3A] cursor-pointer">
            <input type="checkbox" className="w-4 h-4 mt-0.5 accent-[#00838F]" checked={form.consent}
              onChange={(e) => set('consent', e.target.checked)} />
            <span>
              Cette personne a donné son consentement pour que son visage soit enregistré et analysé.
              <span className="block text-[11px] text-[#4A5568] mt-1">
                Les visages sont des données biométriques. Sans consentement, la personne n'est pas reconnue
                et ne peut pas être créée. Vous pouvez supprimer la personne et toutes ses photos à tout moment.
              </span>
            </span>
          </label>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className={`flex-1 ${ghostBtn}`}>Annuler</button>
          <button type="submit" disabled={saving} className={`flex-1 ${primaryBtn}`}>
            {saving ? 'Analyse des photos...' : isEdit ? 'Enregistrer les modifications' : 'Enregistrer la personne'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function PersonsPanel({ zones, onChanged: onZonesChanged }) {
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ search: '', zone: '', status: '' });
  const [editing, setEditing] = useState(null);     // null | 'new' | person
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const [appliedSearch, setAppliedSearch] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    const params = { search: appliedSearch, zone: filters.zone, status: filters.status };
    personsApi.list(Object.fromEntries(Object.entries(params).filter(([, v]) => v)))
      .then((data) => { if (!cancelled) { setPersons(data); setError(''); } })
      .catch((err) => { if (!cancelled) setError(extractError(err, 'Impossible de charger les personnes.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [appliedSearch, filters.zone, filters.status, reloadKey]);

  const zoneName = (id) => zones.find((z) => z.id === id)?.name || '—';

  const confirmDelete = async () => {
    setBusy(true);
    try { await personsApi.remove(deleting.id); setDeleting(null); load(); onZonesChanged(); }
    catch (err) { setError(extractError(err)); setDeleting(null); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <input type="search" placeholder="Rechercher un nom..." aria-label="Rechercher une personne"
          className={`${inputCls} md:max-w-xs`} value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && setAppliedSearch(filters.search.trim())} />
        <select aria-label="Filtrer par zone" className={`${inputCls} md:max-w-[180px]`} value={filters.zone}
          onChange={(e) => setFilters({ ...filters, zone: e.target.value })}>
          <option value="">Toutes les zones</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
        <select aria-label="Filtrer par statut" className={`${inputCls} md:max-w-[180px]`} value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button type="button" onClick={() => setEditing('new')} className={`${primaryBtn} md:ml-auto`}>Ajouter une personne</button>
      </div>
      <Banner>{error}</Banner>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement des personnes...</p>
      ) : persons.length === 0 ? (
        <EmptyState
          title="Aucune personne trouvée"
          hint={`Ajoutez une personne avec au moins ${MIN_PHOTOS} photos pour qu'elle soit reconnue par la caméra.`}
          action={<button type="button" onClick={() => setEditing('new')} className={primaryBtn}>Ajouter une personne</button>}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {persons.map((p) => {
            const st = STATUS[p.status];
            const validity = validityBadge(p);
            return (
              <div key={p.id} className="bg-white rounded-3xl border border-[#D8DEE4] p-5 flex gap-4">
                <AuthImage src={p.faces[0]?.image_url} alt={p.full_name}
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-[#00C2CB] flex-shrink-0"
                  fallback={<div className="w-20 h-20 rounded-2xl bg-[#E4F8F9] text-[#00838F] font-bold text-xl flex items-center justify-center flex-shrink-0">{p.full_name[0]}</div>} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-[#0B1F3A] truncate">{p.full_name}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="text-xs text-[#4A5568] mt-0.5">{p.relation || 'Lien non précisé'} · {p.faces_count} photos</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {p.zones.length === 0
                      ? <span className="text-[11px] text-[#B4702F] font-semibold">Aucune zone : non reconnue</span>
                      : p.zones.map((id) => <span key={id} className="px-2 py-0.5 rounded-full bg-[#F4F6F8] text-[#4A5568] text-[11px] font-medium">{zoneName(id)}</span>)}
                    {validity && <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${validity.cls}`}>{validity.text}</span>}
                    {!p.consent && <span className="px-2 py-0.5 rounded-full bg-red-50 text-[#C22B36] text-[11px] font-semibold">Consentement retiré</span>}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => setEditing(p)} className="text-xs font-bold text-[#00838F] hover:underline cursor-pointer">Modifier</button>
                    <button type="button" onClick={() => setDeleting(p)} className="text-xs font-bold text-[#C22B36] hover:underline cursor-pointer">Supprimer</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <PersonModal person={editing === 'new' ? null : editing} zones={zones}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); onZonesChanged(); }} />
      )}

      {deleting && (
        <Modal title={`Supprimer ${deleting.full_name} ?`} onClose={() => setDeleting(null)}>
          <p className="text-sm text-[#4A5568] mb-5">
            La personne, ses {deleting.faces_count} photos et leurs encodages sont effacés définitivement. Cette action est irréversible.
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setDeleting(null)} className={`flex-1 ${ghostBtn}`}>Annuler</button>
            <button type="button" disabled={busy} onClick={confirmDelete} className={`flex-1 ${dangerBtn}`}>
              {busy ? 'Suppression...' : 'Tout supprimer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
