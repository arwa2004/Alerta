import { useCallback, useEffect, useRef, useState } from 'react';
import { zonesApi } from '../api/recognitionApi';
import {
  listerMedias, detailMedia, televerserMedia, supprimerMedia, reanalyserMedia,
} from '../api/medias';
import { listerAnalyses, detailAnalyse, verifierAuthenticiteMedia } from '../api/authenticite'; // ← AUTH
import { VERDICTS, ModaleAuthenticite } from '../components/authenticite/ResultatAuthenticite'; // ← AUTH

export const STATUTS = {
  en_attente: { label: 'En attente', cls: 'bg-orange-50 text-orange-600' },
  en_cours: { label: 'Analyse en cours', cls: 'bg-[#E4F8F9] text-[#00838F]' },
  termine: { label: 'Terminé', cls: 'bg-green-50 text-green-700' },
  erreur: { label: 'Erreur', cls: 'bg-red-50 text-[#E63946]' },
};

// ← QUALITÉ : niveaux de qualité de l'image
export const QUALITE = {
  bonne: { label: 'Bonne qualité', cls: 'bg-green-50 text-green-700' },
  moyenne: { label: 'Qualité moyenne', cls: 'bg-orange-50 text-orange-600' },
  insuffisante: { label: 'Qualité insuffisante', cls: 'bg-red-50 text-[#E63946]' },
};

const FILTRES = [
  { id: 'tous', label: 'Tous' },
  { id: 'en_cours', label: 'En cours' },
  { id: 'termine', label: 'Terminés' },
  { id: 'erreur', label: 'Erreurs' },
];

const STATUT_PERSONNE = { authorized: 'Autorisée', watched: 'Surveillée', visitor: 'Visiteur' };

const EN_COURS = ['en_attente', 'en_cours']; // ← AUTH

const aplatir = (d) => {
  if (!d) return '';
  if (typeof d === 'string') return d;
  return Object.values(d).flat().map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ');
};

export const formaterTaille = (octets) =>
  octets > 1024 * 1024 ? `${(octets / (1024 * 1024)).toFixed(1)} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`;

export const formaterDate = (d) =>
  new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function Tuile({ titre, valeur, couleur = 'text-[#0B1F3A]' }) {
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
  const [detailQualite, setDetailQualite] = useState(null); // ← QUALITÉ (popup)
  const [aSupprimer, setASupprimer] = useState(null);
  const [analyses, setAnalyses] = useState([]);          // ← AUTH
  const [detailAuth, setDetailAuth] = useState(null);    // ← AUTH
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

  // ← AUTH : analyses d'authenticité de l'utilisateur
  const chargerAnalyses = useCallback(() =>
    listerAnalyses()
      .then((r) => setAnalyses(r.data.results ?? r.data))
      .catch(() => {}), []);

  useEffect(() => { chargerAnalyses(); }, [chargerAnalyses]);

  // Rafraîchissement tant qu'un média OU une vérification est en cours
  const authEnCours = analyses.some((a) => EN_COURS.includes(a.statut)); // ← AUTH
  useEffect(() => {
    const enCours = medias.some((m) => EN_COURS.includes(m.statut)) || authEnCours;
    if (!enCours) return undefined;
    const minuterie = setInterval(() => { charger(); chargerAnalyses(); }, 3000);
    return () => clearInterval(minuterie);
  }, [medias, authEnCours, charger, chargerAnalyses]);

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
      if (detailQualite?.id === id) setDetailQualite(null);
      charger();
    } catch {
      setErreur('Suppression impossible.');
    }
  };

  const ouvrirDetail = (id) =>
    detailMedia(id).then((r) => setDetail(r.data)).catch(() => setErreur('Détails indisponibles.'));

  // ← QUALITÉ : charge le détail complet puis ouvre la popup
  const ouvrirQualite = (id) =>
    detailMedia(id).then((r) => setDetailQualite(r.data)).catch(() => setErreur('Détail de la qualité indisponible.'));

  const relancer = (id) => reanalyserMedia(id).then(charger).catch(() => setErreur('Réanalyse impossible.'));

  // ← AUTH : lancer une vérification d'authenticité / ouvrir son résultat
  const verifier = (mediaId) => {
    setErreur('');
    return verifierAuthenticiteMedia(mediaId)
      .then(chargerAnalyses)
      .catch((err) => setErreur(aplatir(err.response?.data) || 'Vérification impossible.'));
  };

  const ouvrirAuth = (analyseId) =>
    detailAnalyse(analyseId).then((r) => setDetailAuth(r.data)).catch(() => setErreur('Résultat indisponible.'));

  // ← AUTH : une analyse par média (la plus récente)
  const parMedia = {};
  analyses.forEach((a) => { if (a.media_source && !parMedia[a.media_source]) parMedia[a.media_source] = a; });

  const visibles = medias.filter((m) => {
    if (filtre === 'tous') return true;
    if (filtre === 'en_cours') return EN_COURS.includes(m.statut);
    return m.statut === filtre;
  });

  const nbAlertes = medias.filter((m) => m.alerte).length;
  const nbVisages = medias.reduce((n, m) => n + (m.nb_visages || 0), 0);
  const nbEnCours = medias.filter((m) => EN_COURS.includes(m.statut)).length;

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
            const auth = parMedia[m.id];                                             // ← AUTH
            const va = auth && VERDICTS[auth.verdict];                               // ← AUTH
            const authAttente = auth && EN_COURS.includes(auth.statut);              // ← AUTH
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
                      {EN_COURS.includes(m.statut) && (
                        <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse mr-1.5" />
                      )}
                      {s.label}
                    </span>
                    {m.statut === 'termine' && (
                      <span className="text-xs font-semibold text-[#4A5568]">{m.nb_visages} visage(s)</span>
                    )}
                    {/* ← QUALITÉ : badge cliquable */}
                    {m.qualite && QUALITE[m.qualite.niveau] && (
                      <button
                        type="button"
                        onClick={() => ouvrirQualite(m.id)}
                        title="Cliquez pour voir le détail de la qualité"
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer hover:opacity-75 transition ${QUALITE[m.qualite.niveau].cls}`}
                      >
                        Qualité {m.qualite.score}/100 ›
                      </button>
                    )}
                    {/* ← AUTH : verdict d'authenticité */}
                    {auth?.statut === 'termine' && va && (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${va.cls}`}>{va.label}</span>
                    )}
                  </div>

                  {m.statut === 'erreur' && <p className="text-xs text-[#E63946] leading-relaxed">{m.message_erreur}</p>}

                  {/* ← QUALITÉ : conseil d'amélioration */}
                  {m.qualite && m.qualite.niveau !== 'bonne' && m.qualite.conseil && (
                    <p className="text-xs text-orange-600 leading-relaxed">Conseil : {m.qualite.conseil}</p>
                  )}

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

                  {/* ← AUTH : bouton d'authenticité */}
                  {!auth && (
                    <button type="button" onClick={() => verifier(m.id)}
                      className="w-full py-2 rounded-xl border border-[#00C2CB] text-[#00838F] hover:bg-[#E4F8F9] text-xs font-bold cursor-pointer transition">
                      Vérifier l'authenticité
                    </button>
                  )}
                  {authAttente && (
                    <button type="button" disabled
                      className="w-full py-2 rounded-xl bg-[#E4F8F9] text-[#00838F] text-xs font-bold opacity-70 cursor-wait">
                      Vérification en cours…
                    </button>
                  )}
                  {auth?.statut === 'termine' && (
                    <button type="button" onClick={() => ouvrirAuth(auth.id)}
                      className="w-full py-2 rounded-xl border border-[#00C2CB] text-[#00838F] hover:bg-[#E4F8F9] text-xs font-bold cursor-pointer transition">
                      Voir l'authenticité · score {Math.round(auth.score)}/100
                    </button>
                  )}
                  {auth?.statut === 'erreur' && (
                    <button type="button" onClick={() => verifier(m.id)}
                      className="w-full py-2 rounded-xl border border-red-200 text-[#E63946] hover:bg-red-50 text-xs font-bold cursor-pointer transition">
                      Vérification échouée : réessayer
                    </button>
                  )}
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
      {detail && (
        <ModaleResultats
          media={detail}
          onClose={() => setDetail(null)}
          onDetailQualite={() => setDetailQualite(detail)}
        />
      )}

      {/* ← QUALITÉ : popup de détail */}
      {detailQualite && <ModaleQualite media={detailQualite} onClose={() => setDetailQualite(null)} />}

      {/* ← AUTH : modale d'authenticité */}
      {detailAuth && <ModaleAuthenticite analyse={detailAuth} onClose={() => setDetailAuth(null)} />}
    </div>
  );
}

// ← QUALITÉ : barre de progression d'un critère de qualité
function BarreQualite({ titre, score, detail }) {
  const couleur = score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-orange-400' : 'bg-[#E63946]';
  return (
    <div>
      <div className="flex justify-between text-xs font-semibold text-[#0B1F3A] mb-1">
        <span>{titre}</span>
        <span className="text-[#4A5568]">{detail}</span>
      </div>
      <div className="h-2 rounded-full bg-[#E7EBEF]">
        <div className={`h-2 rounded-full ${couleur}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

// ← QUALITÉ : critères, poids dans le score et explications
// (les poids doivent rester identiques à ceux de medias/services/qualite.py)
const CRITERES = [
  {
    cle: 'nettete', titre: 'Netteté', poids: 40,
    mesure: (m) => `indice ${m.nettete}`,
    explication: "Mesure la précision des contours (variance du Laplacien). C'est le critère le plus important : un visage flou ne peut pas être identifié.",
    seuils: 'Net à partir de 100 ; légèrement flou entre 40 et 100 ; très flou sous 40.',
  },
  {
    cle: 'luminosite', titre: 'Luminosité', poids: 25,
    mesure: (m) => `${m.luminosite}/255`,
    explication: "Mesure l'éclairage moyen de l'image. Une image trop sombre ou trop claire cache les traits du visage.",
    seuils: 'Idéal entre 90 et 170 ; trop sombre sous 80 ; surexposée au-dessus de 190.',
  },
  {
    cle: 'contraste', titre: 'Contraste', poids: 15,
    mesure: (m) => `écart ${m.contraste}`,
    explication: 'Mesure la différence entre les zones claires et sombres. Un contraste faible donne une image délavée ou brumeuse.',
    seuils: 'Bon à partir de 45 ; faible sous 25 ; très faible sous 12.',
  },
  {
    cle: 'resolution', titre: 'Résolution', poids: 20,
    mesure: (m) => `${m.largeur}×${m.hauteur}`,
    explication: "Mesure le nombre de pixels (plus petit côté de l'image). Peu de pixels, c'est peu de détails sur les visages.",
    seuils: 'Note maximale à partir de 720 px ; faible sous 480 px ; insuffisante sous 360 px.',
  },
];

const etatCritere = (score) =>
  score >= 75
    ? { label: 'Bon', cls: 'bg-green-50 text-green-700', barre: 'bg-green-500' }
    : score >= 50
      ? { label: 'Moyen', cls: 'bg-orange-50 text-orange-600', barre: 'bg-orange-400' }
      : { label: 'Faible', cls: 'bg-red-50 text-[#E63946]', barre: 'bg-[#E63946]' };

const GRAVITE = {
  haute: { label: 'Majeur', cls: 'bg-red-50 text-[#E63946]' },
  moyenne: { label: 'Modéré', cls: 'bg-orange-50 text-orange-600' },
};

// ← QUALITÉ : popup « pourquoi cette note ? »
export function ModaleQualite({ media, onClose }) {
  const q = media.resultats?.qualite;
  const fermer = (e) => e.stopPropagation();

  if (!q) {
    return (
      <div className="fixed inset-0 bg-[#0B1F3A]/50 flex items-center justify-center p-4 z-[60]" onClick={onClose}>
        <div className="bg-white rounded-3xl p-8 max-w-sm text-center" onClick={fermer}>
          <p className="text-sm text-[#4A5568]">Aucune évaluation de qualité pour ce média. Cliquez sur « Réanalyser ».</p>
          <button type="button" onClick={onClose}
            className="mt-4 px-4 py-2 rounded-xl border border-[#D8DEE4] text-xs font-bold cursor-pointer">Fermer</button>
        </div>
      </div>
    );
  }

  const lignes = CRITERES.map((c) => {
    const note = q.scores[c.cle];
    const points = (note * c.poids) / 100;
    return { ...c, note, points, perdus: c.poids - points, etat: etatCritere(note) };
  });
  const total = lignes.reduce((n, l) => n + l.points, 0);
  const plafonne = q.problemes?.some((p) => p.gravite === 'haute') && total > q.score + 1;
  const pertes = lignes.filter((l) => l.perdus >= 1).sort((a, b) => b.perdus - a.perdus);
  const niveau = QUALITE[q.niveau];

  return (
    <div className="fixed inset-0 bg-[#0B1F3A]/50 flex items-center justify-center p-4 z-[60]" onClick={onClose}>
      <div className="bg-white rounded-3xl border border-[#D8DEE4] shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-y-auto" onClick={fermer}>
        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 p-6 border-b border-[#E7EBEF]">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[#0B1F3A]">Détail de la qualité</h3>
            <p className="text-xs text-[#4A5568] mt-0.5 truncate">{media.nom_original}</p>
          </div>
          <button type="button" onClick={onClose}
            className="text-2xl leading-none text-[#4A5568] hover:text-[#0B1F3A] cursor-pointer">×</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Score et verdict */}
          <div className="flex items-center gap-5">
            <div className="w-24 h-24 rounded-full border-8 border-[#E7EBEF] flex flex-col items-center justify-center flex-shrink-0">
              <span className="text-3xl font-extrabold text-[#0B1F3A] leading-none">{q.score}</span>
              <span className="text-[11px] text-[#4A5568]">/ 100</span>
            </div>
            <div>
              {niveau && <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${niveau.cls}`}>{niveau.label}</span>}
              <p className="text-sm text-[#4A5568] mt-2">{q.fiabilite}</p>
            </div>
          </div>

          {/* Pourquoi cette note ? */}
          <section className="bg-[#F4F6F8] rounded-2xl p-4">
            <h4 className="font-bold text-[#0B1F3A] mb-1.5">Pourquoi {q.score}/100 ?</h4>
            {pertes.length === 0 ? (
              <p className="text-sm text-[#4A5568]">
                Tous les critères sont bons : l'image est nette, bien éclairée et suffisamment détaillée.
              </p>
            ) : (
              <p className="text-sm text-[#4A5568] leading-relaxed">
                Il manque {100 - q.score} points sur 100 :{' '}
                {pertes.map((l, i) => (
                  <span key={l.cle}>
                    {i > 0 && ', '}
                    <b className="text-[#0B1F3A]">{l.titre.toLowerCase()}</b> (−{Math.round(l.perdus)} pt{Math.round(l.perdus) > 1 ? 's' : ''})
                  </span>
                ))}
                . Le point le plus à améliorer est la <b className="text-[#0B1F3A]">{pertes[0].titre.toLowerCase()}</b>.
              </p>
            )}
            {plafonne && (
              <p className="text-xs text-[#E63946] mt-2 font-semibold">
                Le score est plafonné à 49 : un défaut majeur rend l'image insuffisante, même si les autres critères sont bons.
              </p>
            )}
          </section>

          {/* Calcul critère par critère */}
          <section>
            <h4 className="font-bold text-[#0B1F3A] mb-3">Calcul détaillé</h4>
            <div className="space-y-4">
              {lignes.map((l) => (
                <div key={l.cle} className="border border-[#E7EBEF] rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#0B1F3A] text-sm">{l.titre}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${l.etat.cls}`}>{l.etat.label}</span>
                    </div>
                    <span className="text-xs font-semibold text-[#4A5568]">mesuré : {l.mesure(q.mesures)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#E7EBEF] mt-3">
                    <div className={`h-2 rounded-full ${l.etat.barre}`} style={{ width: `${l.note}%` }} />
                  </div>
                  <div className="flex justify-between text-xs mt-2 font-semibold">
                    <span className="text-[#4A5568]">Note {l.note}/100 × poids {l.poids} %</span>
                    <span className="text-[#0B1F3A]">{l.points.toFixed(1)} / {l.poids} pts</span>
                  </div>
                  <p className="text-xs text-[#4A5568] mt-2 leading-relaxed">{l.explication}</p>
                  <p className="text-[11px] text-[#8FA3B8] mt-1">Repères : {l.seuils}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center mt-4 px-4 py-3 rounded-xl bg-[#0B1F3A] text-white text-sm font-bold">
              <span>Total</span>
              <span>{plafonne ? `${total.toFixed(1)} → plafonné à ${q.score}` : `${q.score}`} / 100</span>
            </div>
          </section>

          {/* Problèmes et conseils */}
          {q.problemes?.length > 0 && (
            <section>
              <h4 className="font-bold text-[#0B1F3A] mb-3">Problèmes détectés et conseils</h4>
              <ul className="space-y-2">
                {q.problemes.map((p, i) => {
                  const g = GRAVITE[p.gravite] || GRAVITE.moyenne;
                  return (
                    <li key={i} className="flex items-start gap-3 bg-orange-50 rounded-xl px-4 py-3">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${g.cls}`}>{g.label}</span>
                      <span className="text-xs text-[#0B1F3A] leading-relaxed">{p.conseil}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Informations complémentaires */}
          <section className="text-xs text-[#4A5568] space-y-1">
            {q.mesures.taille_visage && (
              <p>
                Taille médiane des visages détectés : <b className="text-[#0B1F3A]">{q.mesures.taille_visage} px</b> (minimum fiable : 60 px).
              </p>
            )}
            {q.mesures.images_analysees > 1 && (
              <p>
                Valeurs médianes calculées sur <b className="text-[#0B1F3A]">{q.mesures.images_analysees} images</b> extraites de la vidéo.
              </p>
            )}
            <p>Formule : 40 % netteté + 25 % luminosité + 20 % résolution + 15 % contraste. Les seuils sont indicatifs.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

export function ModaleResultats({ media, onClose, onDetailQualite }) {
  const r = media.resultats || {};
  const connus = r.known_snapshots || [];
  const inconnus = r.unknown_snapshots || [];
  const visagesPhoto = r.faces || [];
  const mouvement = r.mouvement || {};
  const q = r.qualite; // ← QUALITÉ

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

          {/* ← QUALITÉ : évaluation de la qualité de l'image */}
          {q && QUALITE[q.niveau] && (
            <section>
              <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <h4 className="font-bold text-[#0B1F3A]">Qualité de l'image</h4>
                <div className="flex items-center gap-3">
                  {onDetailQualite && (
                    <button type="button" onClick={onDetailQualite}
                      className="text-xs font-bold text-[#00838F] hover:underline cursor-pointer">
                      Voir le détail du calcul
                    </button>
                  )}
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${QUALITE[q.niveau].cls}`}>
                    {q.score}/100 · {QUALITE[q.niveau].label}
                  </span>
                </div>
              </div>
              <div className="space-y-3 bg-[#F4F6F8] rounded-2xl p-4">
                <BarreQualite titre="Netteté" score={q.scores.nettete} detail={`indice ${q.mesures.nettete}`} />
                <BarreQualite titre="Luminosité" score={q.scores.luminosite} detail={`${q.mesures.luminosite}/255`} />
                <BarreQualite titre="Contraste" score={q.scores.contraste} detail={`${q.mesures.contraste}`} />
                <BarreQualite titre="Résolution" score={q.scores.resolution} detail={`${q.mesures.largeur}×${q.mesures.hauteur}`} />
              </div>
              <p className="text-xs text-[#4A5568] mt-3">{q.fiabilite}</p>
              {q.conseils.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {q.conseils.map((c, i) => (
                    <li key={i} className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">{c}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

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
            <p className="text-sm text-[#4A5568]">Aucun visage détecté dans ce média.</p>
          )}
        </div>
      </div>
    </div>
  );
}