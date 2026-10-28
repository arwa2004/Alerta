import { useEffect, useState } from 'react';
import { videosApi, extractError } from '../../api/recognitionApi';
import { Modal, Banner } from './ui';
import { primaryBtn, ghostBtn } from './styles';

export default function UnknownTrackerModal({ target, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [threshold, setThreshold] = useState(0.50);

  const runSearch = (th = threshold) => {
    if (!target) return;
    setLoading(true);
    setError('');

    const payload = {
      video_id: target.video_id,
      unknown_index: target.unknown_index,
      thumbnail: target.thumbnail,
      threshold: th,
    };

    videosApi.searchUnknown(payload)
      .then((res) => {
        setData(res);
        setError('');
      })
      .catch((err) => {
        setError(extractError(err, "Échec de la recherche inter-zones."));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    runSearch(threshold);
  }, [target]);

  if (!target) return null;

  const formatDate = (isoStr) => {
    if (!isoStr) return '';
    return new Date(isoStr).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Modal title="🔍 Traque biométrique de l'inconnu dans toutes les zones" onClose={onClose} wide={true}>
      <div className="space-y-6">
        {/* Carte de l'inconnu ciblé */}
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4">
          <div className="relative">
            <img
              src={target.thumbnail}
              alt="Inconnu cible"
              className="w-24 h-24 object-cover rounded-xl border-2 border-red-400 shadow-md bg-black"
            />
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Cible
            </span>
          </div>

          <div className="space-y-1.5 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h4 className="text-sm font-black text-[#0B1F3A]">
                Individu Inconnu #{typeof target.unknown_index === 'number' ? target.unknown_index + 1 : ''}
              </h4>
              {target.zone_name && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-gray-200 text-[#00838F]">
                  📍 {target.zone_name}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600">
              Capturé dans la vidéo source {target.timestamp ? `vers ⏱️ ${target.timestamp}` : ''} {target.created_at ? `le 📅 ${formatDate(target.created_at)}` : ''}
            </p>
            <p className="text-[11px] text-gray-500">
              Recherche par empreinte faciale 128D dans <strong>toutes les vidéos enregistrées</strong> de toutes vos zones de surveillance.
            </p>
          </div>

          {/* Sélecteur de sensibilité / seuil */}
          <div className="bg-white rounded-xl p-2.5 border border-red-200 text-xs space-y-1 w-full sm:w-auto text-center sm:text-left">
            <label className="block text-[11px] font-bold text-gray-700">Seuil de similarité :</label>
            <div className="flex items-center gap-1.5">
              {[
                { val: 0.45, label: 'Strict' },
                { val: 0.50, label: 'Normal' },
                { val: 0.55, label: 'Large' },
              ].map((s) => (
                <button
                  key={s.val}
                  type="button"
                  onClick={() => {
                    setThreshold(s.val);
                    runSearch(s.val);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    threshold === s.val
                      ? 'bg-[#00C2CB] text-[#0B1F3A]'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <Banner>{error}</Banner>

        {/* Chargement */}
        {loading && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-3">
            <div className="animate-spin text-3xl">🔄</div>
            <p className="text-xs font-bold text-[#0B1F3A]">
              Comparaison biométrique en cours sur l'ensemble de vos caméras et zones...
            </p>
            <p className="text-[11px] text-gray-400">
              Calcul des distances euclidiennes vectorielles frame par frame.
            </p>
          </div>
        )}

        {/* Résultats */}
        {!loading && data && (
          <div className="space-y-4">
            {/* Alerte si ressemblance avec une personne connue */}
            {data.known_person_match && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-3 flex items-center gap-3 text-xs text-yellow-900">
                <span className="text-xl">💡</span>
                <div>
                  <b>Forte ressemblance détectée :</b> Cet inconnu ressemble à <b>{data.known_person_match.confidence}%</b> à la personne autorisée{' '}
                  <span className="underline font-bold">{data.known_person_match.full_name}</span> (distance biométrique : {data.known_person_match.distance}).
                </div>
              </div>
            )}

            {/* En-tête des résultats */}
            <div className="flex items-center justify-between px-1">
              <h5 className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A] flex items-center gap-2">
                <span>🎯</span> Correspondances trouvées ({data.matches_count})
              </h5>
              <span className="text-[11px] text-gray-500">
                {data.total_videos_analyzed} vidéo(s) analysée(s) au total
              </span>
            </div>

            {/* Aucun résultat trouvé */}
            {data.matches_count === 0 && (
              <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-8 text-center space-y-2">
                <span className="text-3xl">🛡️</span>
                <p className="text-sm font-bold text-[#0B1F3A]">Aucune autre apparition trouvée</p>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  Cet individu n'a été aperçu dans <strong>aucune autre vidéo</strong> de surveillance de vos zones.
                  Il s'agit de son unique passage enregistré.
                </p>
              </div>
            )}

            {/* Liste des apparitions dans d'autres vidéos */}
            {data.matches_count > 0 && (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {data.matches.map((m, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl border border-red-200 p-4 shadow-sm hover:border-red-400 transition-all space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-red-100 text-red-700">
                          📍 {m.zone_name}
                        </span>
                        <span className="text-xs text-gray-600 font-medium">
                          📅 {formatDate(m.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                          🎯 {m.confidence}% similarité
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          (dist: {m.distance})
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      {/* Vignette de l'inconnu dans cette autre vidéo */}
                      <div className="flex items-center gap-2">
                        <img
                          src={m.snapshot?.thumbnail}
                          alt={`Apparition ${idx + 1}`}
                          className="w-16 h-16 object-cover rounded-xl border border-red-300 bg-black flex-shrink-0"
                        />
                        <div className="text-xs space-y-0.5">
                          <span className="font-bold text-[#0B1F3A] block">
                            Apparition #{idx + 1}
                          </span>
                          <span className="font-mono text-gray-500 block">
                            ⏱️ {m.snapshot?.first_seen && m.snapshot?.last_seen && m.snapshot.first_seen !== m.snapshot.last_seen
                              ? `${m.snapshot.first_seen} à ${m.snapshot.last_seen}`
                              : m.snapshot?.timestamp}
                          </span>
                          {m.snapshot?.count > 1 && (
                            <span className="text-[10px] text-red-600 font-medium block">
                              Vu sur {m.snapshot.count} frames
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Aperçu vidéo ou lien */}
                      <div className="flex-1 flex sm:justify-end items-center gap-2 w-full">
                        {m.video_url && (
                          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <a
                              href={m.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`${primaryBtn} text-[11px] py-1.5 px-3 flex items-center gap-1`}
                            >
                              <span>▶️</span> Visionner la vidéo dans Media
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-3 border-t border-gray-100">
          <button type="button" onClick={onClose} className={ghostBtn}>
            Fermer
          </button>
        </div>
      </div>
    </Modal>
  );
}
