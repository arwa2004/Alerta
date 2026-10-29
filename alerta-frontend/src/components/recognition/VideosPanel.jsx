import { useEffect, useState } from 'react';
import { videosApi, extractError } from '../../api/recognitionApi';
import { Banner, EmptyState } from './ui';
import { STATUS, inputCls, labelCls, ghostBtn, dangerBtn } from './styles';
import UnknownTrackerModal from './UnknownTrackerModal';

export default function VideosPanel({ zones }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [alertFilter, setAlertFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [trackingUnknown, setTrackingUnknown] = useState(null);

  const loadVideos = () => {
    setLoading(true);
    const params = {};
    if (zoneFilter) params.zone = zoneFilter;
    if (alertFilter) params.alert = alertFilter;

    videosApi.list(params)
      .then((data) => {
        setVideos(data);
        setError('');
      })
      .catch((err) => setError(extractError(err, 'Impossible de charger les vidéos enregistrées.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadVideos();
  }, [zoneFilter, alertFilter]);

  const handleDelete = async (id) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cette vidéo et son fichier de media/ ?')) {
      return;
    }
    setDeletingId(id);
    try {
      await videosApi.remove(id);
      setVideos((prev) => prev.filter((v) => v.id !== id));
    } catch (err) {
      alert(extractError(err, 'Erreur lors de la suppression de la vidéo.'));
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* En-tête et filtres */}
      <div className="bg-white rounded-3xl border border-[#D8DEE4] p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[#0B1F3A] flex items-center gap-2">
              <span>📹</span> Vidéos de surveillance enregistrées
            </h3>
            <p className="text-xs text-[#4A5568] mt-0.5">
              Toutes les vidéos envoyées restent stockées dans <code>media/</code> avec l'historique complet des personnes connues et inconnues.
            </p>
          </div>
          <button
            type="button"
            onClick={loadVideos}
            disabled={loading}
            className={`${ghostBtn} text-xs py-2 px-4 flex items-center gap-2 self-start sm:self-auto`}
          >
            <span>🔄</span> Actualiser ({videos.length})
          </button>
        </div>

        {/* Filtres Zone & Alerte */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t border-gray-100">
          <div>
            <label className={labelCls}>Filtrer par Zone</label>
            <select
              className={inputCls}
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
            >
              <option value="">Toutes les zones ({zones.length})</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Filtrer par Détection</label>
            <select
              className={inputCls}
              value={alertFilter}
              onChange={(e) => setAlertFilter(e.target.value)}
            >
              <option value="">Toutes les vidéos</option>
              <option value="true">🚨 Alertes intrusions uniquement</option>
              <option value="false">✅ Zones sécurisées uniquement</option>
            </select>
          </div>
        </div>
      </div>

      <Banner>{error}</Banner>

      {/* Chargement */}
      {loading && (
        <div className="bg-white rounded-3xl border border-[#D8DEE4] p-8 text-center text-sm text-[#4A5568]">
          Chargement des vidéos de surveillance enregistrées...
        </div>
      )}

      {/* État vide */}
      {!loading && videos.length === 0 && (
        <EmptyState
          title="Aucune vidéo enregistrée"
          hint="Dès que vous analysez une vidéo dans l'onglet « Tester », elle est automatiquement conservée dans media/ avec ses visages détectés."
        />
      )}

      {/* Liste des vidéos */}
      {!loading && videos.length > 0 && (
        <div className="space-y-5">
          {videos.map((vid) => {
            const isExpanded = expandedId === vid.id;
            const isDeleting = deletingId === vid.id;

            return (
              <div
                key={vid.id}
                className="bg-white rounded-3xl border border-[#D8DEE4] overflow-hidden shadow-sm hover:border-[#00C2CB]/50 transition-all"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
                  {/* Colonne Lecteur Vidéo */}
                  <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
                    <div className="rounded-2xl overflow-hidden bg-black aspect-video border border-gray-800 shadow-inner">
                      {vid.video_url ? (
                        <video
                          src={vid.video_url}
                          controls
                          preload="metadata"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                          Fichier vidéo introuvable
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500 font-mono">
                      <span className="truncate max-w-[200px]" title={vid.original_filename}>
                        📄 {vid.original_filename || `video_${vid.id}.mp4`}
                      </span>
                      <span>⏱️ {vid.duration_seconds}s</span>
                    </div>
                  </div>

                  {/* Colonne Informations et Détections */}
                  <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
                    <div>
                      {/* Ligne d'en-tête de la carte */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-gray-100 text-[#0B1F3A]">
                            📍 {vid.zone_name || `Zone #${vid.zone}`}
                          </span>
                          <span className="text-xs text-gray-500">
                            📅 {formatDate(vid.created_at)}
                          </span>
                        </div>

                        {/* Badge Alerte Intrusion ou Sécurisée */}
                        {vid.alert_triggered ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                            <span>🚨</span> ALERTE INTRUSION
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
                            <span>✅</span> ZONE SÉCURISÉE
                          </span>
                        )}
                      </div>

                      {/* Section Personnes Connues Reconnues */}
                      <div className="mt-4 space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[#1D8A57] flex items-center gap-2">
                          <span>👤</span> Personnes connues reconnues (
                          {vid.known_persons_names?.length || 0})
                        </h4>
                        {vid.known_persons_names?.length > 0 ? (
                          <div className="flex flex-wrap gap-2 items-center">
                            {vid.known_persons_names.map((name, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#2BB673]/10 text-[#1D8A57] border border-[#2BB673]/30"
                              >
                                <span>✓</span> {name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">
                            Aucune personne autorisée détectée dans cette séquence.
                          </p>
                        )}

                        {/* Miniatures des personnes connues si disponibles */}
                        {vid.known_snapshots?.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto py-1">
                            {vid.known_snapshots.map((s, idx) => (
                              <div
                                key={idx}
                                className="flex-shrink-0 text-center bg-gray-50 rounded-lg p-1 border border-green-200"
                              >
                                <img
                                  src={s.thumbnail}
                                  alt={s.full_name}
                                  className="w-12 h-12 object-cover rounded-md"
                                />
                                <span className="block text-[9px] font-bold text-gray-700 truncate max-w-[60px]">
                                  {s.full_name}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Section Personnes Inconnues Détectées */}
                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-[#C22B36] flex items-center gap-2">
                            <span>📸</span> Personnes inconnues repérées (
                            {vid.unknown_count || vid.unknown_snapshots?.length || 0})
                          </h4>
                          {vid.unknown_snapshots?.length > 0 && (
                            <span className="text-[10px] text-gray-500 font-medium">
                              💡 Cliquez sur un visage pour le traquer
                            </span>
                          )}
                        </div>

                        {vid.unknown_snapshots?.length > 0 ? (
                          <div className="flex gap-2.5 overflow-x-auto py-1">
                            {vid.unknown_snapshots.map((s, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setTrackingUnknown({
                                  ...s,
                                  video_id: vid.id,
                                  zone_name: vid.zone_name,
                                  created_at: vid.created_at,
                                  unknown_index: idx,
                                })}
                                title="Cliquer pour chercher cet individu dans toutes les vidéos de toutes les zones"
                                className="flex-shrink-0 text-center bg-red-50 hover:bg-red-100/80 rounded-xl p-2 border border-red-200 hover:border-red-500 transition-all cursor-pointer group shadow-xs hover:shadow-md"
                              >
                                <div className="relative">
                                  <img
                                    src={s.thumbnail}
                                    alt={`Inconnu ${idx + 1}`}
                                    className="w-16 h-16 object-cover rounded-lg border border-red-300 group-hover:scale-105 transition-transform bg-black"
                                  />
                                  <span className="absolute bottom-1 right-1 bg-black/70 text-white rounded-full p-1 text-[10px] group-hover:bg-red-600 transition-colors">
                                    🔍
                                  </span>
                                </div>
                                <span className="block text-[10px] font-bold text-red-800 mt-1">
                                  Inconnu #{idx + 1}
                                </span>
                                <span className="block text-[9px] text-gray-500 font-mono">
                                  {s.first_seen || s.timestamp}
                                </span>
                                <span className="inline-block text-[9px] text-red-600 font-bold mt-0.5 underline">
                                  Traquer ➔
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic">
                            Aucun individu inconnu n'a été repéré.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Boutons d'actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-2">
                        {vid.video_url && (
                          <a
                            href={vid.video_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-[#00838F] hover:underline flex items-center gap-1"
                          >
                            <span>📥</span> Télécharger / Ouvrir dans Media
                          </a>
                        )}
                        {vid.timeline?.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : vid.id)}
                            className="text-xs font-semibold text-[#4A5568] hover:text-[#0B1F3A] flex items-center gap-1 ml-3"
                          >
                            <span>{isExpanded ? '▲ Masquer' : '▼ Voir'} la chronologie ({vid.timeline.length} moments)</span>
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDelete(vid.id)}
                        disabled={isDeleting}
                        className={`${dangerBtn} text-xs py-1.5 px-3`}
                      >
                        {isDeleting ? 'Suppression...' : '🗑️ Supprimer de Media'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Chronologie dépliante (Timeline) */}
                {isExpanded && vid.timeline?.length > 0 && (
                  <div className="bg-gray-50 border-t border-gray-200 p-6 space-y-3">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                      Chronologie précise des détections
                    </h5>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                      {vid.timeline.map((entry, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-white rounded-xl p-2.5 border border-gray-200 text-xs"
                        >
                          <span className="font-mono font-bold text-[#00838F]">
                            ⏱️ {entry.timestamp}
                          </span>
                          <div className="flex items-center gap-2">
                            {entry.faces?.map((f, fi) => (
                              <span
                                key={fi}
                                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                  f.is_known
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {f.is_known
                                  ? `✓ ${f.person?.full_name} (${f.confidence}%)`
                                  : `🚨 Inconnu (${f.confidence}%)`}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
