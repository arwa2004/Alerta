import { useCallback, useEffect, useState } from 'react';
import {
  adminListerMedias, adminDetailMedia, adminSupprimerMedia, adminReanalyserMedia, adminStatsMedias,
} from '../../api/medias';
import { STATUTS, formaterTaille, formaterDate, Tuile, ModaleResultats } from '../../pages/Medias';

export default function AdminMedias() {
  const [medias, setMedias] = useState([]);
  const [stats, setStats] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState('');
  const [type, setType] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [detail, setDetail] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);

  const charger = useCallback(() => {
    const params = {};
    if (recherche.trim()) params.search = recherche.trim();
    if (statut) params.statut = statut;
    if (type) params.type = type;
    return Promise.all([adminListerMedias(params), adminStatsMedias()])
      .then(([liste, s]) => {
        setMedias(liste.data.results ?? liste.data);
        setStats(s.data);
        setErreur('');
      })
      .catch(() => setErreur('Impossible de charger les médias.'))
      .finally(() => setChargement(false));
  }, [recherche, statut, type]);

  useEffect(() => {
    const t = setTimeout(charger, 300);   // petite attente pendant la frappe
    return () => clearTimeout(t);
  }, [charger]);

  // Rafraîchissement tant qu'un média est en cours d'analyse
  useEffect(() => {
    if (!medias.some((m) => ['en_attente', 'en_cours'].includes(m.statut))) return undefined;
    const minuterie = setInterval(charger, 4000);
    return () => clearInterval(minuterie);
  }, [medias, charger]);

  const ouvrir = (id) => adminDetailMedia(id).then((r) => setDetail(r.data)).catch(() => setErreur('Détails indisponibles.'));
  const relancer = (id) => adminReanalyserMedia(id).then(charger).catch(() => setErreur('Réanalyse impossible.'));

  const confirmerSuppression = async () => {
    const id = aSupprimer;
    setASupprimer(null);
    try {
      await adminSupprimerMedia(id);
      if (detail?.id === id) setDetail(null);
      charger();
    } catch {
      setErreur('Suppression impossible.');
    }
  };

  const enCours = (stats?.par_statut?.en_cours || 0) + (stats?.par_statut?.en_attente || 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#0B1F3A]">Gestion des médias</h2>
        <p className="text-xs text-[#8FA3B8] mt-0.5">Tous les fichiers envoyés par les utilisateurs d'Alerta</p>
      </div>

      {/* ── Compteurs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Tuile titre="Médias" valeur={stats?.total ?? '—'} />
        <Tuile titre="Photos / Vidéos" valeur={stats ? `${stats.photos} / ${stats.videos}` : '—'} />
        <Tuile titre="Alertes" valeur={stats?.alertes ?? '—'} couleur={stats?.alertes ? 'text-[#E63946]' : 'text-[#0B1F3A]'} />
        <Tuile titre="En cours" valeur={stats ? enCours : '—'} couleur="text-[#00838F]" />
        <Tuile titre="Stockage" valeur={stats ? formaterTaille(stats.taille_totale) : '—'} />
      </div>

      {/* ── Tableau ── */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        <div className="p-6 border-b border-[#F0F2F5] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h3 className="text-base font-bold text-[#0B1F3A]">Médias de la plateforme</h3>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text" placeholder="Utilisateur ou fichier…" value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              className="px-3 py-2 border border-[#E5E7EB] rounded-xl text-xs w-56 bg-[#FBFBFC] focus:outline-none focus:ring-2 focus:ring-[#00C2CB]"
            />
            <select value={statut} onChange={(e) => setStatut(e.target.value)}
              className="px-3 py-2 border border-[#E5E7EB] rounded-xl text-xs font-medium bg-[#FBFBFC] focus:outline-none focus:ring-2 focus:ring-[#00C2CB]">
              <option value="">Tous les statuts</option>
              <option value="en_attente">En attente</option>
              <option value="en_cours">En cours</option>
              <option value="termine">Terminés</option>
              <option value="erreur">Erreurs</option>
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)}
              className="px-3 py-2 border border-[#E5E7EB] rounded-xl text-xs font-medium bg-[#FBFBFC] focus:outline-none focus:ring-2 focus:ring-[#00C2CB]">
              <option value="">Photos et vidéos</option>
              <option value="photo">Photos</option>
              <option value="video">Vidéos</option>
            </select>
          </div>
        </div>

        {erreur && <p className="px-6 py-3 text-sm text-[#E63946] bg-red-50">{erreur}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FBFBFC] border-b border-[#F0F2F5] text-[#8FA3B8] uppercase font-bold tracking-wider">
                <th className="px-6 py-3.5">Média</th>
                <th className="px-6 py-3.5">Utilisateur</th>
                <th className="px-6 py-3.5">Zone</th>
                <th className="px-6 py-3.5">Statut</th>
                <th className="px-6 py-3.5">Visages</th>
                <th className="px-6 py-3.5">Date</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F2F5]">
              {chargement ? (
                <tr><td colSpan="7" className="text-center py-10 text-gray-400">Chargement des médias...</td></tr>
              ) : medias.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-10 text-gray-400">Aucun média trouvé.</td></tr>
              ) : medias.map((m) => {
                const s = STATUTS[m.statut];
                return (
                  <tr key={m.id} className="hover:bg-[#FBFBFC] transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {m.type === 'photo'
                          ? <img src={m.fichier} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
                          : <video src={m.fichier} preload="metadata" muted className="w-11 h-11 rounded-lg object-cover flex-shrink-0 bg-[#0B1F3A]" />}
                        <div className="min-w-0">
                          <p className="font-bold text-[#0B1F3A] truncate max-w-[180px]" title={m.nom_original}>{m.nom_original}</p>
                          <p className="text-[11px] text-[#8FA3B8]">{m.type === 'photo' ? 'Photo' : 'Vidéo'} · {formaterTaille(m.taille)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-[#0B1F3A]">{m.owner_nom}</p>
                      <p className="text-[11px] text-[#8FA3B8]">{m.owner_email}</p>
                    </td>
                    <td className="px-6 py-4 text-[#4A5568]">{m.zone_nom}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full font-bold text-[11px] ${s.cls}`}>{s.label}</span>
                      {m.alerte && <span className="ml-2 text-[11px] font-bold text-[#E63946]">Alerte</span>}
                    </td>
                    <td className="px-6 py-4 text-[#4A5568]">{m.statut === 'termine' ? m.nb_visages : '—'}</td>
                    <td className="px-6 py-4 text-[#4A5568]">{formaterDate(m.date_upload)}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        {m.statut === 'termine' && (
                          <button onClick={() => ouvrir(m.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#00838F] hover:bg-[#006B75] text-white cursor-pointer transition">
                            Résultats
                          </button>
                        )}
                        {['termine', 'erreur'].includes(m.statut) && (
                          <button onClick={() => relancer(m.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[#E5E7EB] text-[#0B1F3A] hover:bg-gray-50 cursor-pointer transition">
                            Réanalyser
                          </button>
                        )}
                        <button onClick={() => setASupprimer(m.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 text-[#C22B36] hover:bg-red-50 cursor-pointer transition">
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Utilisateurs les plus actifs ── */}
      {stats?.top_utilisateurs?.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-xs">
          <h3 className="text-base font-bold text-[#0B1F3A] mb-3">Utilisateurs les plus actifs</h3>
          <ul className="divide-y divide-[#F0F2F5]">
            {stats.top_utilisateurs.map((u) => (
              <li key={u.id} className="flex justify-between py-2.5 text-sm">
                <span className="text-[#0B1F3A] font-semibold">{u.email}</span>
                <span className="text-[#4A5568]">{u.medias} média(s) · {formaterTaille(u.taille)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Confirmation de suppression ── */}
      {aSupprimer && (
        <div className="fixed inset-0 bg-[#0B1F3A]/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-[#D8DEE4] p-8 max-w-sm w-full shadow-2xl text-center">
            <h3 className="text-lg font-bold text-[#0B1F3A] mb-1.5">Supprimer ce média ?</h3>
            <p className="text-xs text-[#4A5568] mb-6">
              Le fichier appartient à un utilisateur. Il sera supprimé définitivement, avec son analyse.
            </p>
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

      {detail && <ModaleResultats media={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}