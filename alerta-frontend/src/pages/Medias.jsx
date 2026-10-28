import { useCallback, useEffect, useRef, useState } from 'react';
import { zonesApi } from '../api/recognitionApi';
import {
  listerMedias, detailMedia, televerserMedia, supprimerMedia, reanalyserMedia,
} from '../api/medias';

export const STATUTS = {   // ← export ajouté
  en_attente: { label: 'En attente', cls: 'bg-orange-50 text-orange-600' },
  en_cours: { label: 'Analyse en cours', cls: 'bg-[#E4F8F9] text-[#00838F]' },
  termine: { label: 'Terminé', cls: 'bg-green-50 text-green-700' },
  erreur: { label: 'Erreur', cls: 'bg-red-50 text-[#E63946]' },
};

const FILTRES = [
  { id: 'tous', label: 'Tous' },
  { id: 'en_cours', label: 'En cours' },
  { id: 'termine', label: 'Terminés' },
  { id: 'erreur', label: 'Erreurs' },
];

const STATUT_PERSONNE = { authorized: 'Autorisée', watched: 'Surveillée', visitor: 'Visiteur' };

const aplatir = (d) => {
  if (!d) return '';
  if (typeof d === 'string') return d;
  return Object.values(d).flat().map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ');
};

export const formaterTaille = (octets) =>   // ← export ajouté
  octets > 1024 * 1024 ? `${(octets / (1024 * 1024)).toFixed(1)} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`;

export const formaterDate = (d) =>   // ← export ajouté
  new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function Tuile({ titre, valeur, couleur = 'text-[#0B1F3A]' }) {   // ← export ajouté
  return (
    <div className="bg-white rounded-2xl border border-[#D8DEE4] p-4">
      <p className="text-xs font-semibold text-[#4A5568] uppercase tracking-wide">{titre}</p>
      <p className={`text-2xl font-bold mt-1 ${couleur}`}>{valeur}</p>
    </div>
  );
}

export default function Medias({ onGoZones }) {
  const [zones, setZones] = useState([]);
  const [zoneId, setZoneId] = useState('');
  const [medias, setMedias] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState('tous');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [survol, setSurvol] = useState(false);
  const [detail, setDetail] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);
  const champFichier = useRef(null);

  // Zones (API du module 1)
  useEffect(() => {
    zonesApi.list()
      .then((liste) => {
        const donnees = liste.results ?? liste;
        setZones(donnees);
        if (donnees.length) setZoneId(String(donnees[0].id));
      })
      .catch(() => setErreur('Impossible de charger les zones.'))
      .finally(() => setChargement(false));
  }, []);

  const charger = useCallback(() => {
    if (!zoneId) return Promise.resolve();
    return listerMedias(zoneId)
      .then((r) => setMedias(r.data.results ?? r.data))
      .catch(() => setErreur('Impossible de charger les médias.'));
  }, [zoneId]);

  useEffect(() => { charger(); }, [charger]);

  // Rafraîchissement tant qu'un média est en cours de traitement
  useEffect(() => {
    if (!medias.some((m) => ['en_attente', 'en_cours'].includes(m.statut))) return undefined;
    const minuterie = setInterval(charger, 3000);
    return () => clearInterval(minuterie);
  }, [medias, charger]);

  const envoyer = async (fichiers) => {
    if (!fichiers.length || !zoneId) return;
    setErreur('');
    setEnvoi(true);
    for (const fichier of fichiers) {
      try {
        await televerserMedia(zoneId, fichier);
      } catch (err) {
        setErreur(`${fichier.name} : ${aplatir(err.response?.data) || "échec de l'envoi."}`);
      }
    }
    await charger();
    setEnvoi(false);
  };

  const confirmerSuppression = async () => {
    const id = aSupprimer;
    setASupprimer(null);
    try {
      await supprimerMedia(id);
      if (detail?.id === id) setDetail(null);
      charger();
    } catch {
      setErreur('Suppression impossible.');
    }
  };

  const ouvrirDetail = (id) =>
    detailMedia(id).then((r) => setDetail(r.data)).catch(() => setErreur('Détails indisponibles.'));

  const relancer = (id) => reanalyserMedia(id).then(charger).catch(() => setErreur('Réanalyse impossible.'));

  const visibles = medias.filter((m) => {
    if (filtre === 'tous') return true;
    if (filtre === 'en_cours') return ['en_attente', 'en_cours'].includes(m.statut);
    return m.statut === filtre;
  });

  const nbAlertes = medias.filter((m) => m.alerte).length;
  const nbVisages = medias.reduce((n, m) => n + (m.nb_visages || 0), 0);
  const nbEnCours = medias.filter((m) => ['en_attente', 'en_cours'].includes(m.statut)).length;

  // ── Aucune zone ────────────────────────────────────────────────────────────
  if (!chargement && zones.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-[#D8DEE4] p-10 text-center space-y-3">
        <h2 className="text-xl font-bold text-[#0B1F3A]">Créez d'abord une zone</h2>
        <p className="text-sm text-[#4A5568]">
          Chaque photo ou vidéo est rattachée à une zone surveillée. Créez-en une pour commencer.
        </p>
        {onGoZones && (
          <button type="button" onClick={onGoZones}
            className="mt-2 px-5 py-2.5 rounded-xl bg-[#00838F] hover:bg-[#006B75] text-white text-sm font-bold cursor-pointer transition">
            Aller aux zones
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#0B1F3A]">Médias et analyse</h2>
          <p className="text-sm text-[#4A5568] mt-1">
            Envoyez les photos et vidéos de vos caméras : Alerta détecte et identifie les visages.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#0B1F3A]">
          Zone
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}
            className="border border-[#D8DEE4] rounded-xl bg-white px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#00C2CB]">
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </label>
      </div>

      {/* ── Compteurs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tuile titre="Médias" valeur={medias.length} />
        <Tuile titre="Visages détectés" valeur={nbVisages} />
        <Tuile titre="Alertes" valeur={nbAlertes} couleur={nbAlertes ? 'text-[#E63946]' : 'text-[#0B1F3A]'} />
        <Tuile titre="En cours" valeur={nbEnCours} couleur="text-[#00838F]" />
      </div>

      {/* ── Zone de dépôt ── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); envoyer([...e.dataTransfer.files]); }}
        onClick={() => champFichier.current?.click()}
        className={`cursor-pointer rounded-3xl border-2 border-dashed p-8 text-center transition ${
          survol ? 'border-[#00C2CB] bg-[#E4F8F9]' : 'border-[#BFD0D9] bg-white hover:border-[#00C2CB]'}`}
      >
        <input ref={champFichier} type="file" multiple className="hidden"
          accept="image/jpeg,image/png,video/mp4,video/x-msvideo,video/quicktime,video/x-matroska"
          onChange={(e) => { envoyer([...e.target.files]); e.target.value = ''; }} />
        <div className="w-14 h-14 rounded-2xl bg-[#E4F8F9] text-[#00838F] flex items-center justify-center mx-auto mb-3">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <p className="font-bold text-[#0B1F3A]">{envoi ? 'Envoi en cours…' : 'Glissez vos fichiers ici ou cliquez pour parcourir'}</p>
        <p className="text-xs text-[#4A5568] mt-1">JPG, PNG (10 Mo max) · MP4, AVI, MOV, MKV (200 Mo max)</p>
      </div>

      {erreur && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-[#E63946] text-sm font-medium px-4 py-3 flex justify-between gap-3">
          <span>{erreur}</span>
          <button type="button" onClick={() => setErreur('')} className="font-bold cursor-pointer">×</button>
        </div>
      )}

      {/* ── Filtres ── */}
      <div className="flex gap-1 border-b border-[#D8DEE4]">
        {FILTRES.map((f) => (
          <button key={f.id} type="button" onClick={() => setFiltre(f.id)}
            className={`px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 cursor-pointer transition ${
              filtre === f.id ? 'border-[#00C2CB] text-[#0B1F3A]' : 'border-transparent text-[#4A5568] hover:text-[#0B1F3A]'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Galerie ── */}
      {visibles.length === 0 ? (
        <p className="text-center text-sm text-[#4A5568] py-10">Aucun média à afficher.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibles.map((m) => {
            const s = STATUTS[m.statut];
            return (
              <div key={m.id} className="bg-white rounded-3xl border border-[#D8DEE4] shadow-sm hover:shadow-lg transition overflow-hidden flex flex-col">
                <div className="relative h-44 bg-[#0B1F3A]">
                  {m.type === 'photo'
                    ? <img src={m.fichier} alt="" className="w-full h-full object-cover" />
                    : <video src={m.fichier} preload="metadata" muted className="w-full h-full object-cover" />}
                  <span className="absolute top-3 left-3 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#0B1F3A]/80 text-white">
                    {m.type === 'photo' ? 'Photo' : 'Vidéo'}
                  </span>
                  {m.alerte && (
                    <span className="absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#E63946] text-white">
                      Alerte
                    </span>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col gap-3">
                  <div>
                    <p className="font-bold text-[#0B1F3A] truncate" title={m.nom_original}>{m.nom_original}</p>
                    <p className="text-xs text-[#4A5568] mt-0.5">
                      {formaterDate(m.date_upload)} · {formaterTaille(m.taille)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.cls}`}>
                      {['en_attente', 'en_cours'].includes(m.statut) && (
                        <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse mr-1.5" />
                      )}
                      {s.label}
                    </span>
                    {m.statut === 'termine' && (
                      <span className="text-xs font-semibold text-[#4A5568]">{m.nb_visages} visage(s)</span>
                    )}
                  </div>

                  {m.statut === 'erreur' && <p className="text-xs text-[#E63946] leading-relaxed">{m.message_erreur}</p>}

                  <div className="flex gap-2 pt-3 mt-auto border-t border-[#E7EBEF]">
                    {m.statut === 'termine' && (
                      <button type="button" onClick={() => ouvrirDetail(m.id)}
                        className="flex-1 py-2 rounded-xl bg-[#00838F] hover:bg-[#006B75] text-white text-xs font-bold cursor-pointer transition">
                        Résultats
                      </button>
                    )}
                    {['termine', 'erreur'].includes(m.statut) && (
                      <button type="button" onClick={() => relancer(m.id)}
                        className="flex-1 py-2 rounded-xl border border-[#D8DEE4] text-[#0B1F3A] hover:bg-[#F4F6F8] text-xs font-bold cursor-pointer transition">
                        Réanalyser
                      </button>
                    )}
                    <button type="button" onClick={() => setASupprimer(m.id)}
                      className="px-3 py-2 rounded-xl border border-[#D8DEE4] text-[#E63946] hover:bg-red-50 text-xs font-bold cursor-pointer transition">
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modale de confirmation de suppression ── */}
      {aSupprimer && (
        <div className="fixed inset-0 bg-[#0B1F3A]/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-[#D8DEE4] p-8 max-w-sm w-full shadow-2xl text-center">
            <h3 className="text-lg font-bold text-[#0B1F3A] mb-1.5">Supprimer ce média ?</h3>
            <p className="text-xs text-[#4A5568] mb-6">Le fichier et son analyse seront définitivement supprimés.</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setASupprimer(null)}
                className="flex-1 py-2.5 border border-[#D8DEE4] rounded-xl text-xs font-bold text-[#4A5568] hover:bg-gray-50 cursor-pointer">
                Annuler
              </button>
              <button type="button" onClick={confirmerSuppression}
                className="flex-1 py-2.5 bg-[#E63946] hover:bg-red-700 text-white rounded-xl text-xs font-bold cursor-pointer">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale des résultats ── */}
      {detail && <ModaleResultats media={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

export function ModaleResultats({ media, onClose }) {   // ← export ajouté
  const r = media.resultats || {};
  const connus = r.known_snapshots || [];
  const inconnus = r.unknown_snapshots || [];
  const visagesPhoto = r.faces || [];
  const mouvement = r.mouvement || {};

  return (
    <div className="fixed inset-0 bg-[#0B1F3A]/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-3xl border border-[#D8DEE4] shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 p-6 border-b border-[#E7EBEF]">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[#0B1F3A] truncate">{media.nom_original}</h3>
            <p className="text-xs text-[#4A5568] mt-0.5">Zone : {media.zone_nom}</p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-[#4A5568] hover:text-[#0B1F3A] cursor-pointer">×</button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tuile titre="Visages" valeur={r.total_detections ?? 0} />
            <Tuile titre="Alerte" valeur={r.alert_triggered ? 'Oui' : 'Non'} couleur={r.alert_triggered ? 'text-[#E63946]' : 'text-green-700'} />
            <Tuile titre="Connus" valeur={(r.known_persons || []).length} />
            <Tuile titre="Mouvement" valeur={mouvement.detecte ? 'Oui' : 'Non'} />
          </div>

          {r.duration_seconds > 0 && (
            <p className="text-xs text-[#4A5568]">Durée analysée : {r.duration_seconds} s</p>
          )}

          {connus.length > 0 && (
            <section>
              <h4 className="font-bold text-[#0B1F3A] mb-3">Personnes reconnues</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {connus.map((p) => (
                  <figure key={p.id} className="bg-[#F4F6F8] rounded-2xl p-3 text-center">
                    <img src={p.thumbnail} alt="" className="w-full h-28 object-cover rounded-xl" />
                    <figcaption className="mt-2">
                      <p className="text-sm font-bold text-[#0B1F3A] truncate">{p.full_name}</p>
                      <p className="text-xs text-[#4A5568]">{STATUT_PERSONNE[p.status] || p.status} · {p.confidence}%</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          {inconnus.length > 0 && (
            <section>
              <h4 className="font-bold text-[#E63946] mb-3">Personnes inconnues</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {inconnus.map((p, i) => (
                  <figure key={i} className="bg-red-50 rounded-2xl p-3 text-center">
                    <img src={p.thumbnail} alt="" className="w-full h-28 object-cover rounded-xl" />
                    <figcaption className="mt-2 text-xs text-[#4A5568]">
                      {p.first_seen === p.last_seen ? p.first_seen : `${p.first_seen} → ${p.last_seen}`}
                      <br />vu {p.count} fois
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          {visagesPhoto.length > 0 && (
            <section>
              <h4 className="font-bold text-[#0B1F3A] mb-3">Visages détectés</h4>
              <ul className="divide-y divide-[#E7EBEF] border border-[#E7EBEF] rounded-2xl">
                {visagesPhoto.map((v, i) => (
                  <li key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="font-semibold text-[#0B1F3A]">{v.person ? v.person.full_name : 'Inconnu'}</span>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      v.should_alert ? 'bg-red-50 text-[#E63946]' : 'bg-green-50 text-green-700'}`}>
                      {v.is_known ? `Reconnu · ${v.confidence}%` : 'Inconnu'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {mouvement.detecte && (
            <section>
              <h4 className="font-bold text-[#0B1F3A] mb-2">Mouvements détectés</h4>
              <p className="text-sm text-[#4A5568]">
                Aux secondes : {mouvement.instants.slice(0, 30).join(', ')}{mouvement.instants.length > 30 ? '…' : ''}
              </p>
            </section>
          )}

          {r.total_detections === 0 && (
            <p className="text-sm text-[#4A5568]">Aucun media détecté dans ce média.</p>
          )}
        </div>
      </div>
    </div>
  );
}