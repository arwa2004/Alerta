import { useEffect, useMemo, useState } from 'react';
import { zonesApi, extractError } from '../../api/recognitionApi';
import { Banner, EmptyState } from './ui';
import { STATUS, inputCls, labelCls, primaryBtn } from './styles';
import UnknownTrackerModal from './UnknownTrackerModal';

export default function TestPanel({ zones }) {
  const [zoneId, setZoneId] = useState('');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [trackingUnknown, setTrackingUnknown] = useState(null);

  const currentZone = zoneId || (zones[0] ? String(zones[0].id) : '');
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const isVideo = file && (file.type?.startsWith('video/') || /\.(mp4|avi|mov|webm)$/i.test(file.name));

  useEffect(() => {
    let interval;
    if (loading) {
      setProgress(5);
      setProgressStage(isVideo ? 'Initialisation et découpage des flux vidéo...' : 'Chargement du modèle biométrique...');
      interval = setInterval(() => {
        setProgress((prev) => {
          // Simulation progressive qui ralentit au fur et à mesure
          // Ne dépasse jamais 95% — les 5% restants sont réservés à la fin du traitement serveur
          if (prev < 20) {
            setProgressStage(isVideo ? 'Extraction des images et normalisation...' : 'Localisation des visages...');
            return Math.min(20, prev + (isVideo ? 3 : 7));
          }
          if (prev < 50) {
            setProgressStage(isVideo ? 'Localisation IA des visages (multi-échelle, upsample×2)...' : 'Calcul des descripteurs 128D...');
            return Math.min(50, prev + (isVideo ? 1.2 : 4));
          }
          if (prev < 75) {
            setProgressStage('Comparaison biométrique avec les personnes connues de la zone...');
            return Math.min(75, prev + (isVideo ? 0.7 : 2));
          }
          if (prev < 90) {
            setProgressStage('Regroupement des individus et sélection des meilleures captures...');
            return Math.min(90, prev + (isVideo ? 0.3 : 1));
          }
          if (prev < 95) {
            setProgressStage('Finalisation du rapport et compression des vignettes...');
            return Math.min(95, prev + 0.15);
          }
          // On reste bloqué à 95% jusqu'à ce que le serveur réponde réellement
          setProgressStage('En attente de la réponse du serveur...');
          return prev;
        });
      }, 500);
    } else {
      // La réponse est arrivée → on passe directement à 100%
      setProgress(100);
      setProgressStage('Analyse terminée !');
    }
    return () => clearInterval(interval);
  }, [loading, isVideo]);

  const run = async (e) => {
    e.preventDefault();
    setError(''); setResult(null); setLoading(true); setProgress(0);
    try {
      const data = await zonesApi.identify(currentZone, file);
      setResult(data);
    } catch (err) {
      setError(extractError(err, "L'analyse a échoué."));
    } finally {
      setLoading(false);
    }
  };

  if (zones.length === 0) {
    return <EmptyState title="Créez une zone pour tester" hint="Le test compare une photo ou vidéo aux personnes rattachées à la zone choisie." />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      {/* Formulaire de téléversement */}
      <form onSubmit={run} className="bg-white rounded-3xl border border-[#D8DEE4] p-6 space-y-4">
        <p className="text-sm text-[#4A5568]">
          Envoyez une <strong>photo</strong> ou une <strong>vidéo</strong> (.mp4, .avi, .mov) pour tester la détection IA de visages connus et inconnus en conditions réelles.
        </p>

        <div>
          <label className={labelCls} htmlFor="t-zone">Zone surveillée</label>
          <select id="t-zone" className={inputCls} value={currentZone} onChange={(e) => setZoneId(e.target.value)}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}{z.is_active ? '' : ' (suspendue)'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls} htmlFor="t-file">Fichier à analyser (Photo ou Vidéo)</label>
          <input
            id="t-file"
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/x-msvideo,video/quicktime,video/webm,.avi,.mp4,.mov,.webm"
            required
            onChange={(e) => { setFile(e.target.files[0] || null); setResult(null); }}
            className="block w-full text-xs text-[#4A5568] file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-[#E4F8F9] file:text-[#00838F] file:font-bold file:cursor-pointer"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Formats acceptés : JPG, PNG, WebP (photos) et MP4, AVI, MOV, WebM (vidéos).
          </p>
        </div>

        {/* Aperçu Média */}
        {preview && (
          <div className="rounded-2xl overflow-hidden bg-[#0B1F3A]/5 border border-[#D8DEE4]">
            {isVideo ? (
              <video src={preview} controls className="w-full max-h-72 object-contain bg-black" />
            ) : (
              <img src={preview} alt="Aperçu à analyser" className="w-full max-h-72 object-contain bg-[#F4F6F8]" />
            )}
          </div>
        )}

        <button type="submit" disabled={!file || loading} className={`w-full ${primaryBtn}`}>
          {loading
            ? (isVideo ? 'Analyse vidéo IA en cours (frame par frame)...' : 'Analyse des visages en cours...')
            : (isVideo ? '🎬 Analyser la vidéo' : '📸 Analyser la photo')}
        </button>
      </form>

      {/* Résultats de l'analyse */}
      <div className="space-y-4">
        <Banner>{error}</Banner>

        {loading && (
          <div className="bg-white rounded-3xl border border-[#D8DEE4] p-6 text-center space-y-4 shadow-sm">
            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl">🤖</span>
              <span className="text-3xl font-black text-[#00838F]">{Math.round(progress)}%</span>
            </div>
            <div>
              <p className="font-bold text-[#0B1F3A] text-sm">{progressStage}</p>
              <p className="text-xs text-[#4A5568] mt-1">
                {isVideo ? 'Extraction des images, localisation multi-échelle des visages et comparaison biométrique.' : 'Localisation du visage et calcul des descripteurs biométriques.'}
              </p>
            </div>
            {/* Barre de progression avec pourcentage */}
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden border border-gray-200">
              <div
                className="bg-gradient-to-r from-[#00838F] to-[#2BB673] h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.round(progress)}%` }}
              />
            </div>
            {progress >= 95 && (
              <p className="text-[11px] text-orange-500 font-medium animate-pulse">
                ⏳ Traitement vidéo en cours côté serveur, cela peut prendre 1–2 min...
              </p>
            )}
          </div>
        )}

        {/* RÉSULTAT : VIDÉO */}
        {result?.type === 'video' && (
          <div className="space-y-4">
            {/* Bannière Alerte Principale */}
            {result.alert_triggered ? (
              <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 text-[#C22B36] font-bold flex items-center gap-3">
                <span className="text-2xl">🚨</span>
                <div>
                  <p className="text-base">ALERTE INTRUSION DÉTECTÉE !</p>
                  <p className="text-xs font-normal text-red-600">Un ou plusieurs visages inconnus ont été repérés dans cette vidéo.</p>
                </div>
              </div>
            ) : (
              <div className="bg-[#2BB673]/15 border border-[#2BB673]/30 rounded-2xl p-4 text-[#1D8A57] font-bold flex items-center gap-3">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="text-base">Zone sécurisée</p>
                  <p className="text-xs font-normal text-[#1D8A57]">Seules des personnes autorisées ont été détectées.</p>
                </div>
              </div>
            )}

            {/* Notification de sauvegarde dans Media */}
            {result.saved && (
              <div className="bg-[#E4F8F9] border border-[#00838F]/30 rounded-2xl p-3 text-xs text-[#00838F] font-medium flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>💾</span>
                  <span>Vidéo enregistrée dans <code>media/</code> avec les personnes connues et inconnues.</span>
                </div>
                {result.video_url && (
                  <a
                    href={result.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold underline hover:text-[#0B1F3A]"
                  >
                    Visionner le fichier
                  </a>
                )}
              </div>
            )}

            {/* Statistiques de la vidéo */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl border border-[#D8DEE4] p-3 text-center">
                <span className="text-xs text-[#4A5568] block">⏱️ Durée</span>
                <b className="text-base text-[#0B1F3A]">{result.duration_seconds}s</b>
              </div>
              <div className="bg-white rounded-2xl border border-[#D8DEE4] p-3 text-center">
                <span className="text-xs text-[#4A5568] block">👤 Reconnus</span>
                <b className="text-sm text-[#1D8A57] truncate block">{result.known_persons.join(', ') || 'Aucun'}</b>
              </div>
              <div className="bg-white rounded-2xl border border-[#D8DEE4] p-3 text-center">
                <span className="text-xs text-[#4A5568] block">🚨 Inconnus</span>
                <b className={`text-base ${result.unknown_snapshots?.length ? 'text-[#C22B36]' : 'text-gray-500'}`}>
                  {result.unknown_snapshots?.length || 0}
                </b>
              </div>
            </div>

            {/* Instantanés des personnes reconnues autorisées (avec leur photo extraite de la vidéo) */}
            {result.known_snapshots?.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#2BB673]/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#1D8A57] flex items-center gap-2">
                    <span>👤</span> {result.known_snapshots.length} personne{result.known_snapshots.length > 1 ? 's' : ''} reconnue{result.known_snapshots.length > 1 ? 's' : ''} autorisée{result.known_snapshots.length > 1 ? 's' : ''}
                  </h4>
                  <span className="text-[11px] text-gray-500 font-medium">Captures extraites de la vidéo</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {result.known_snapshots.map((snap, idx) => (
                    <div key={idx} className="text-center group bg-[#2BB673]/5 rounded-xl p-2.5 border border-[#2BB673]/20 hover:border-[#2BB673] transition-colors">
                      <img src={snap.thumbnail} alt={snap.full_name} className="w-full aspect-square object-cover rounded-lg border border-[#2BB673]/40 shadow-sm" />
                      <div className="mt-2 space-y-1">
                        <span className="text-xs font-bold text-[#0B1F3A] block truncate">{snap.full_name}</span>
                        <span className="text-[10px] text-gray-500 font-mono block">⏱️ {snap.timestamp}</span>
                        <span className="inline-block text-[10px] font-semibold text-[#1D8A57] bg-[#2BB673]/15 px-2 py-0.5 rounded-full border border-[#2BB673]/30">
                          {snap.confidence}% confiance
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Instantanés des visages inconnus uniques */}
            {result.unknown_snapshots?.length > 0 && (
              <div className="bg-white rounded-2xl border border-red-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#C22B36] flex items-center gap-2">
                    <span>📸</span> {result.unknown_snapshots.length} personne{result.unknown_snapshots.length > 1 ? 's' : ''} inconnue{result.unknown_snapshots.length > 1 ? 's' : ''} distincte{result.unknown_snapshots.length > 1 ? 's' : ''}
                  </h4>
                  <span className="text-[10px] text-gray-500 font-medium">💡 Cliquez sur un visage pour le traquer</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {result.unknown_snapshots.map((snap, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setTrackingUnknown({
                        ...snap,
                        video_id: result.video_id,
                        zone_name: zones.find(z => String(z.id) === String(currentZone))?.name,
                        unknown_index: idx,
                      })}
                      title="Cliquer pour chercher cet inconnu dans toutes les vidéos de toutes les zones"
                      className="text-center group bg-gray-50 hover:bg-red-50 rounded-xl p-2 border border-gray-200 hover:border-red-400 transition-all cursor-pointer shadow-xs hover:shadow-md"
                    >
                      <div className="relative">
                        <img src={snap.thumbnail} alt={`Inconnu ${idx + 1}`} className="w-full aspect-square object-cover rounded-lg border border-red-300 shadow-sm group-hover:scale-105 transition-transform bg-black" />
                        <span className="absolute bottom-1 right-1 bg-black/70 text-white rounded-full p-1 text-[9px] group-hover:bg-red-600 transition-colors">
                          🔍
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-0.5">
                        <span className="text-[11px] font-bold text-gray-800 block">Inconnu #{idx + 1}</span>
                        <span className="text-[10px] text-gray-500 font-mono block">
                          ⏱️ {snap.first_seen && snap.last_seen && snap.first_seen !== snap.last_seen ? `${snap.first_seen} - ${snap.last_seen}` : snap.timestamp}
                        </span>
                        {snap.count > 1 && (
                          <span className="inline-block text-[9px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.2 rounded border border-red-200">
                            vu {snap.count} frames
                          </span>
                        )}
                        <span className="block text-[9px] text-red-600 font-bold mt-1 underline">
                          Traquer ➔
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chronologie des détections */}
            <div className="bg-white rounded-2xl border border-[#D8DEE4] p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#4A5568]">Chronologie des détections</h4>
              {result.timeline?.length === 0 ? (
                <p className="text-xs text-gray-400">Aucun visage détecté sur l'ensemble de la vidéo.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {result.timeline.map((entry, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-gray-50 border border-gray-100">
                      <span className="font-mono font-bold text-gray-600">⏱️ {entry.timestamp}</span>
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {entry.faces.map((f, fi) => (
                          <span
                            key={fi}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[11px] ${
                              f.should_alert
                                ? 'bg-red-100 text-[#C22B36] border border-red-200'
                                : 'bg-[#2BB673]/15 text-[#1D8A57] border border-[#2BB673]/30'
                            }`}
                          >
                            {f.thumbnail && (
                              <img src={f.thumbnail} alt="" className="w-5 h-5 rounded-full object-cover border border-current" />
                            )}
                            <span>{f.is_known ? f.person.full_name : 'INCONNU'} ({f.confidence}%)</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* RÉSULTAT : IMAGE FIXE */}
        {(result?.type === 'image' || (result?.faces && !result?.type)) && (
          <div className="space-y-3">
            {result.count === 0 && <Banner type="success">Aucun visage détecté dans cette image.</Banner>}
            {result.faces?.map((f, i) => (
              <div key={i} className={`bg-white rounded-2xl border p-5 ${f.should_alert ? 'border-red-200' : 'border-[#D8DEE4]'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#0B1F3A] truncate">
                      {f.is_known ? f.person.full_name : `Visage inconnu n°${i + 1}`}
                    </p>
                    {f.person && (
                      <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${STATUS[f.person.status].cls}`}>
                        {STATUS[f.person.status].label}
                      </span>
                    )}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${f.should_alert ? 'bg-red-50 text-[#C22B36]' : 'bg-[#2BB673]/15 text-[#1D8A57]'}`}>
                    {f.should_alert ? 'Alerte' : 'Aucune alerte'}
                  </span>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-[#4A5568] mb-1">
                    <span>Confiance</span>
                    <span className="font-mono">{f.confidence}% · distance {f.distance ?? '—'}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#E7EBEF] overflow-hidden">
                    <div className={`h-full ${f.is_known ? 'bg-[#2BB673]' : 'bg-[#E63946]'}`} style={{ width: `${f.confidence}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de traque d'inconnu inter-zones */}
      {trackingUnknown && (
        <UnknownTrackerModal
          target={trackingUnknown}
          onClose={() => setTrackingUnknown(null)}
        />
      )}
    </div>
  );
}
