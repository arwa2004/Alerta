import { useCallback, useEffect, useState } from 'react';
import {
  adminListerAnalyses, adminDetailAnalyse, adminSupprimerAnalyse,
  adminReanalyserAnalyse, adminStatsAnalyses,
} from '../../api/authenticite';
import { STATUTS, Tuile, formaterDate } from '../../pages/Medias';
import { VERDICTS, ModaleAuthenticite } from '../authenticite/ResultatAuthenticite';

export default function AdminAuthenticite() {
  const [analyses, setAnalyses] = useState([]);
  const [stats, setStats] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [verdict, setVerdict] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [detail, setDetail] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);

  const charger = useCallback(() => {
    const params = {};
    if (recherche.trim()) params.search = recherche.trim();
    if (verdict) params.verdict = verdict;
    return Promise.all([adminListerAnalyses(params), adminStatsAnalyses()])
      .then(([liste, s]) => { setAnalyses(liste.data.results ?? liste.data); setStats(s.data); setErreur(''); })
      .catch(() => setErreur("Impossible de charger les analyses."))
      .finally(() => setChargement(false));
  }, [recherche, verdict]);

  useEffect(() => {
    const t = setTimeout(charger, 300);
    return () => clearTimeout(t);
  }, [charger]);

  useEffect(() => {
    if (!analyses.some((a) => ['en_attente', 'en_cours'].includes(a.statut))) return undefined;
    const minuterie = setInterval(charger, 4000);
    return () => clearInterval(minuterie);
  }, [analyses, charger]);

  const ouvrir = (id) => adminDetailAnalyse(id).then((r) => setDetail(r.data)).catch(() => setErreur('Détails indisponibles.'));
  const relancer = (id) => adminReanalyserAnalyse(id).then(charger).catch(() => setErreur('Réanalyse impossible.'));

  const confirmerSuppression = async () => {
    const id = aSupprimer;
    setASupprimer(null);
    try {
      await adminSupprimerAnalyse(id);
      if (detail?.id === id) setDetail(null);
      charger();
    } catch {
      setErreur('Suppression impossible.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#0B1F3A]">Authenticité des médias</h2>
        <p className="text-xs text-[#8FA3B8] mt-0.5">Toutes les analyses de retouche effectuées sur la plateforme</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Tuile titre="Analyses" valeur={stats?.total ?? '—'} />
        <Tuile titre="Photos / Vidéos" valeur={stats ? `${stats.photos} / ${stats.videos}` : '—'} />
        <Tuile titre="Suspects" valeur={stats?.suspects ?? '—'} couleur={stats?.suspects ? 'text-[#E63946]' : 'text-[#0B1F3A]'} />
        <Tuile titre="Taux suspects" valeur={stats ? `${stats.taux_suspects} %` : '—'} />
        <Tuile titre="Score moyen" valeur={stats?.score_moyen ?? '—'} couleur="text-[#00838F]" />
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        <div className="p-6 border-b border-[#F0F2F5] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <h3 className="text-base font-bold text-[#0B1F3A]">Analyses de la plateforme</h3>
          <div className="flex items-center gap-3 flex-wrap">
            <input type="text" placeholder="Utilisateur ou fichier…" value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              className="px-3 py-2 border border-[#E5E7EB] rounded-xl text-xs w-56 bg-[#FBFBFC] focus:outline-none focus:ring-2 focus:ring-[#00C2CB]" />
            <select value={verdict} onChange={(e) => setVerdict(e.target.value)}
              className="px-3 py-2 border border-[#E5E7EB] rounded-xl text-xs font-medium bg-[#FBFBFC] focus:outline-none focus:ring-2 focus:ring-[#00C2CB]">
              <option value="">Tous les verdicts</option>
              <option value="authentique">Authentiques</option>
              <option value="suspect">Suspects</option>
              <option value="retouche">Retouchés</option>
            </select>
          </div>
        </div>

        {erreur && <p className="px-6 py-3 text-sm text-[#E63946] bg-red-50">{erreur}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FBFBFC] border-b border-[#F0F2F5] text-[#8FA3B8] uppercase font-bold tracking-wider">
                <th className="px-6 py-3.5">Fichier</th>
                <th className="px-6 py-3.5">Utilisateur</th>
                <th className="px-6 py-3.5">Statut</th>
                <th className="px-6 py-3.5">Verdict</th>
                <th className="px-6 py-3.5">Score</th>
                <th className="px-6 py-3.5">Date</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F2F5]">
              {chargement ? (
                <tr><td colSpan="7" className="text-center py-10 text-gray-400">Chargement…</td></tr>
              ) : analyses.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-10 text-gray-400">Aucune analyse trouvée.</td></tr>
              ) : analyses.map((a) => {
                const s = STATUTS[a.statut];
                const v = VERDICTS[a.verdict];
                return (
                  <tr key={a.id} className="hover:bg-[#FBFBFC] transition">
                    <td className="px-6 py-4">
                      <p className="font-bold text-[#0B1F3A] truncate max-w-[200px]" title={a.nom_original}>{a.nom_original}</p>
                      <p className="text-[11px] text-[#8FA3B8]">{a.type === 'photo' ? 'Photo' : 'Vidéo'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-[#0B1F3A]">{a.owner_nom}</p>
                      <p className="text-[11px] text-[#8FA3B8]">{a.owner_email}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full font-bold text-[11px] ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="px-6 py-4">
                      {v ? <span className={`inline-flex px-2.5 py-0.5 rounded-full font-bold text-[11px] ${v.cls}`}>{v.label}</span> : '—'}
                    </td>
                    <td className="px-6 py-4 text-[#4A5568]">{a.statut === 'termine' ? Math.round(a.score) : '—'}</td>
                    <td className="px-6 py-4 text-[#4A5568]">{formaterDate(a.date_upload)}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        {a.statut === 'termine' && (
                          <button onClick={() => ouvrir(a.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#00838F] hover:bg-[#006B75] text-white cursor-pointer transition">
                            Résultats
                          </button>
                        )}
                        {['termine', 'erreur'].includes(a.statut) && (
                          <button onClick={() => relancer(a.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[#E5E7EB] text-[#0B1F3A] hover:bg-gray-50 cursor-pointer transition">
                            Réanalyser
                          </button>
                        )}
                        <button onClick={() => setASupprimer(a.id)}
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

      {aSupprimer && (
        <div className="fixed inset-0 bg-[#0B1F3A]/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-[#D8DEE4] p-8 max-w-sm w-full shadow-2xl text-center">
            <h3 className="text-lg font-bold text-[#0B1F3A] mb-1.5">Supprimer cette analyse ?</h3>
            <p className="text-xs text-[#4A5568] mb-6">Le fichier appartient à un utilisateur. Il sera supprimé définitivement.</p>
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

      {detail && <ModaleAuthenticite analyse={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}