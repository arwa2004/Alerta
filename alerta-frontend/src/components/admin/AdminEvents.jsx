import { useCallback, useEffect, useState } from 'react';
import eventsApi from '../../api/eventsApi';
import EventDetailModal from '../EventDetailModal';

function Tuile({ titre, valeur, couleur = 'text-[#0B1F3A]' }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-xs flex flex-col justify-between">
      <p className="text-xs text-[#8FA3B8] font-bold uppercase tracking-wider">{titre}</p>
      <p className={`text-2xl font-extrabold mt-2 ${couleur}`}>{valeur}</p>
    </div>
  );
}

const CRITICITE_BADGES = {
  critique: { label: 'Critique', bg: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  elevee: { label: 'Élevée', bg: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  moderee: { label: 'Modérée', bg: 'bg-yellow-50 text-yellow-800 border-yellow-200', dot: 'bg-yellow-500' },
  faible: { label: 'Faible', bg: 'bg-green-50 text-green-700 border-green-200', dot: 'bg-green-500' },
};

const TYPE_CONFIG = {
  visage_inconnu: { label: 'Visage Inconnu', dot: 'bg-rose-500', icon: '👤' },
  visage_connu: { label: 'Visage Connu', dot: 'bg-emerald-500', icon: '✅' },
  mouvement: { label: 'Mouvement', dot: 'bg-amber-500', icon: '🔦' },
  autre: { label: 'Autre Détection', dot: 'bg-gray-400', icon: '📹' },
};

export default function AdminEvents() {
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [criticiteFilter, setCriticiteFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modal de détail & simulation
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [eventToDelete, setEventToDelete] = useState(null);

  const fetchStats = async () => {
    try {
      const data = await eventsApi.getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Erreur stats admin events:', err);
    }
  };

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page };
      if (search.trim()) params.search = search.trim();
      if (typeFilter) params.type = typeFilter;
      if (criticiteFilter) params.niveau_criticite = criticiteFilter;

      const res = await eventsApi.getEvenements(params);
      if (res.results) {
        setEvents(res.results);
        setTotalCount(res.count || 0);
        setTotalPages(Math.max(1, Math.ceil((res.count || 1) / 10)));
      } else {
        const arr = Array.isArray(res) ? res : [];
        setEvents(arr);
        setTotalCount(arr.length);
        setTotalPages(1);
      }
      setError('');
    } catch (err) {
      setError('Impossible de charger les événements.');
    } finally {
      setLoading(false);
    }
  }, [page, search, typeFilter, criticiteFilter]);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEvents();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchEvents]);

  const handleSimulate = async (scenario = 'inconnu') => {
    setIsSimulating(true);
    try {
      const newEv = await eventsApi.simulateEvenement(scenario);
      await fetchStats();
      await fetchEvents();
      setSelectedEvent(newEv);
    } catch (err) {
      setError('Erreur lors de la simulation de détection.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleDelete = async () => {
    if (!eventToDelete) return;
    const id = eventToDelete;
    setEventToDelete(null);
    try {
      await eventsApi.deleteEvenement(id);
      if (selectedEvent?.id === id) setSelectedEvent(null);
      await fetchStats();
      await fetchEvents();
    } catch (err) {
      setError('Suppression impossible.');
    }
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '—';
    try {
      return new Date(isoStr).toLocaleString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Titre & Description ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#0B1F3A]">Gestion des événements &amp; IA</h2>
          <p className="text-xs text-[#8FA3B8] mt-0.5">
            Historique complet des détections faciales, alertes de sécurité et analyse prédictive
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 mr-1 hidden md:inline">Simulateur :</span>
          <button
            onClick={() => handleSimulate('inconnu')}
            disabled={isSimulating}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#E4F8F9] text-[#00838F] hover:bg-[#00C2CB]/20 transition disabled:opacity-50 cursor-pointer"
          >
            {isSimulating ? '...' : '+ Inconnu'}
          </button>
          <button
            onClick={() => handleSimulate('connu')}
            disabled={isSimulating}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50 cursor-pointer"
          >
            {isSimulating ? '...' : '+ Connu'}
          </button>
          <button
            onClick={() => handleSimulate('mouvement')}
            disabled={isSimulating}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-800 hover:bg-amber-100 transition disabled:opacity-50 cursor-pointer"
          >
            {isSimulating ? '...' : '+ Mouvement'}
          </button>
        </div>
      </div>

      {/* ── Compteurs Statistiques (5 Tuiles comme dans AdminMedias) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Tuile titre="Total Événements" valeur={stats?.total_evenements ?? '—'} />
        <Tuile titre="Aujourd'hui" valeur={stats?.evenements_aujourdhui ?? '—'} couleur="text-[#00838F]" />
        <Tuile
          titre="Inconnus & Mouvements"
          valeur={(stats?.inconnus_count ?? 0) + (stats?.mouvements_count ?? 0)}
          couleur="text-[#E63946]"
        />
        <Tuile titre="Visages Identifiés" valeur={stats?.visages_connus_count ?? '—'} couleur="text-[#1D8A57]" />
        <Tuile titre="Alertes Critiques" valeur={stats?.critiques_count ?? '—'} couleur="text-[#E63946]" />
      </div>

      {/* ── Tableau & Filtres ── */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
        <div className="p-6 border-b border-[#F0F2F5] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[#0B1F3A]">Événements de la plateforme</h3>
            <span className="text-xs bg-gray-100 text-[#4A5568] px-2 py-0.5 rounded-full font-bold">
              {totalCount}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Recherche zone ou description…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-[#E5E7EB] rounded-xl text-xs w-56 bg-[#FBFBFC] focus:outline-none focus:ring-2 focus:ring-[#00C2CB]"
            />

            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-[#E5E7EB] rounded-xl text-xs font-medium bg-[#FBFBFC] focus:outline-none focus:ring-2 focus:ring-[#00C2CB]"
            >
              <option value="">Tous les types</option>
              <option value="visage_inconnu">Visage Inconnu</option>
              <option value="visage_connu">Visage Connu</option>
              <option value="mouvement">Mouvement</option>
              <option value="autre">Autre</option>
            </select>

            <select
              value={criticiteFilter}
              onChange={(e) => {
                setCriticiteFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-[#E5E7EB] rounded-xl text-xs font-medium bg-[#FBFBFC] focus:outline-none focus:ring-2 focus:ring-[#00C2CB]"
            >
              <option value="">Toutes les criticités</option>
              <option value="critique">Critique</option>
              <option value="elevee">Élevée</option>
              <option value="moderee">Modérée</option>
              <option value="faible">Faible</option>
            </select>
          </div>
        </div>

        {error && <p className="px-6 py-3 text-sm text-[#E63946] bg-red-50">{error}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#FBFBFC] border-b border-[#F0F2F5] text-[#8FA3B8] uppercase font-bold tracking-wider">
                <th className="px-6 py-3.5">Événement</th>
                <th className="px-6 py-3.5">Type &amp; Statut</th>
                <th className="px-6 py-3.5">Zone &amp; Source</th>
                <th className="px-6 py-3.5">Criticité ML</th>
                <th className="px-6 py-3.5">Date &amp; Heure</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F2F5]">
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center py-10 text-gray-400">
                    Chargement des événements...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-10 text-gray-400">
                    Aucun événement correspondant aux critères.
                  </td>
                </tr>
              ) : (
                events.map((ev) => {
                  const typeConf = TYPE_CONFIG[ev.type_evenement] || TYPE_CONFIG.autre;
                  const crit = CRITICITE_BADGES[ev.score_criticite] || CRITICITE_BADGES.faible;
                  const isKnown = ev.type_evenement === 'visage_connu';

                  return (
                    <tr key={ev.id} className="hover:bg-[#FBFBFC] transition">
                      {/* Événement & miniature */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {ev.image_capturee ? (
                            <img
                              src={
                                ev.image_capturee.startsWith('http')
                                  ? ev.image_capturee
                                  : `http://127.0.0.1:8000${ev.image_capturee}`
                              }
                              alt=""
                              className="w-11 h-11 rounded-lg object-cover flex-shrink-0 border border-gray-100"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center text-lg flex-shrink-0">
                              {typeConf.icon}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-[#0B1F3A] truncate max-w-[200px]">
                              {ev.personne_nom ? `Identifié : ${ev.personne_nom}` : typeConf.label}
                            </p>
                            <p className="text-[11px] text-[#8FA3B8] truncate max-w-[220px]">
                              ID #{ev.id} · {ev.description ? ev.description.slice(0, 35) + '...' : 'Détection capteur'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Type & Pastille colorée */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              isKnown ? 'bg-emerald-500 shadow-xs' : 'bg-rose-500 shadow-xs'
                            }`}
                          />
                          <span className="font-semibold text-[#0B1F3A]">{typeConf.label}</span>
                        </div>
                      </td>

                      {/* Zone & Source */}
                      <td className="px-6 py-4">
                        <p className="font-semibold text-[#0B1F3A]">{ev.zone_nom || 'Zone principale'}</p>
                        <p className="text-[11px] text-[#8FA3B8]">Source : Caméra / M2</p>
                      </td>

                      {/* Criticité ML */}
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${crit.bg}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${crit.dot}`} />
                          {crit.label}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-6 py-4 text-[#4A5568]">{formatDate(ev.date_heure)}</td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setSelectedEvent(ev)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#00838F] hover:bg-[#006B75] text-white cursor-pointer transition flex items-center gap-1"
                          >
                            <span>Détails &amp; IA</span>
                          </button>
                          <button
                            onClick={() => setEventToDelete(ev.id)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 text-[#C22B36] hover:bg-red-50 cursor-pointer transition"
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[#F0F2F5] flex items-center justify-between text-xs text-[#8FA3B8]">
            <p>
              Page {page} sur {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-[#E5E7EB] rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
              >
                Précédent
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 border border-[#E5E7EB] rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal de Confirmation de Suppression ── */}
      {eventToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-gray-100">
            <h4 className="font-bold text-lg text-[#0B1F3A]">Confirmer la suppression</h4>
            <p className="text-xs text-gray-600">
              Êtes-vous sûr de vouloir supprimer cet événement ? Cette action est irréversible.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setEventToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#E63946] text-white hover:bg-red-700 cursor-pointer"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Détails & Génération IA (Module 3) ── */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEventUpdated={(updated) => {
            setSelectedEvent(updated);
            fetchEvents();
            fetchStats();
          }}
        />
      )}
    </div>
  );
}
