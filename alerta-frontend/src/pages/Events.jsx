import React, { useState, useEffect, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import eventsApi from '../api/eventsApi';
import EventDetailModal from '../components/EventDetailModal';
import Navbar from '../components/Navbar';

function Tuile({ titre, valeur, couleur = 'text-[#0B1F3A]' }) {
  return (
    <div className="bg-white rounded-2xl border border-[#D8DEE4] p-4">
      <p className="text-xs font-semibold text-[#4A5568] uppercase tracking-wide">{titre}</p>
      <p className={`text-2xl font-bold mt-1 ${couleur}`}>{valeur}</p>
    </div>
  );
}

export default function Events() {
  const { user } = useContext(AuthContext);

  // Redirection des administrateurs vers leur dashboard dédié
  if (user?.role === 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [photoCapturee, setPhotoCapturee] = useState(null);

  // Filtres
  const [typeFilter, setTypeFilter] = useState('');
  const [criticiteFilter, setCriticiteFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchStats = async () => {
    try {
      const data = await eventsApi.getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Erreur stats events', err);
    }
  };

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params = { page };
      if (typeFilter) params.type = typeFilter;
      if (criticiteFilter) params.niveau_criticite = criticiteFilter;
      if (searchTerm) params.search = searchTerm;

      const data = await eventsApi.getEvenements(params);
      if (data.results) {
        setEvents(data.results);
        setTotalPages(Math.max(1, Math.ceil((data.count || 1) / 10)));
      } else {
        setEvents(Array.isArray(data) ? data : []);
        setTotalPages(1);
      }
    } catch (err) {
      console.error('Erreur chargement événements', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [typeFilter, criticiteFilter, page]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchEvents();
  };

  const handleSimulate = async (scenario) => {
    setSimulating(true);
    try {
      const payload = photoCapturee
        ? { scenario, photo_capturee: photoCapturee }
        : scenario;
      const newEv = await eventsApi.simulateEvenement(payload);
      setPhotoCapturee(null);
      await fetchStats();
      await fetchEvents();
      setSelectedEvent(newEv);
    } catch (err) {
      console.error('Erreur simulation', err);
    } finally {
      setSimulating(false);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Voulez-vous vraiment supprimer cet événement ?')) return;
    try {
      await eventsApi.deleteEvenement(id);
      setEvents(events.filter((ev) => ev.id !== id));
      fetchStats();
    } catch (err) {
      console.error('Erreur suppression', err);
      alert('Impossible de supprimer cet événement.');
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'visage_connu':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-[#1D8A57] border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2BB673]" />
            Visage Connu
          </span>
        );
      case 'inconnu':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-[#C22B36] border border-red-200">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E63946]" />
            Inconnu
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Mouvement
          </span>
        );
    }
  };

  const getCriticiteBadge = (niveau) => {
    switch (niveau) {
      case 'eleve':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-red-50 text-[#C22B36] border border-red-200">Élevé</span>;
      case 'moyen':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-50 text-amber-800 border border-amber-200">Moyen</span>;
      default:
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-green-50 text-[#1D8A57] border border-green-200">Faible</span>;
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] text-[#0B1F3A] font-sans flex flex-col">
      <Navbar activeTab="evenements" />

      <div className="p-6 md:p-10 flex-1">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* ── En-tête : Titre & Actions ── */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[#0B1F3A]">
                Événements et détections IA
              </h1>
              <p className="text-sm text-[#4A5568] mt-1">
                Historique complet des détections enrichies par Gemini, reconstitution IA et scoring ML.
              </p>
            </div>

            {/* Actions : Attacher photo + Simuler */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-[#D8DEE4] shadow-xs">
                <label className="text-xs text-[#00838F] font-bold cursor-pointer flex items-center gap-1.5 hover:text-[#006B75]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                  <span>{photoCapturee ? photoCapturee.name.slice(0, 16) + '...' : 'Attacher une photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setPhotoCapturee(e.target.files[0] || null)}
                    className="hidden"
                  />
                </label>
                {photoCapturee && (
                  <button
                    type="button"
                    onClick={() => setPhotoCapturee(null)}
                    className="text-gray-400 hover:text-red-500 text-xs font-bold ml-1 cursor-pointer"
                    title="Retirer la photo"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-[#8FA3B8] font-bold hidden sm:inline">Simuler :</span>
                <button
                  onClick={() => handleSimulate('inconnu')}
                  disabled={simulating}
                  className="px-3 py-2 text-xs font-bold rounded-xl bg-red-50 text-[#C22B36] border border-red-200 hover:bg-red-100 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E63946]" />
                  + Inconnu
                </button>
                <button
                  onClick={() => handleSimulate('visage_connu')}
                  disabled={simulating}
                  className="px-3 py-2 text-xs font-bold rounded-xl bg-emerald-50 text-[#1D8A57] border border-emerald-200 hover:bg-emerald-100 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2BB673]" />
                  + Visage Connu
                </button>
                <button
                  onClick={() => handleSimulate('mouvement')}
                  disabled={simulating}
                  className="px-3 py-2 text-xs font-bold rounded-xl bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  + Mouvement
                </button>
              </div>
            </div>
          </div>

          {/* ── Compteurs Statistiques (4 Tuiles identiques à la capture 2 de Médias) ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Tuile titre="Événements" valeur={stats?.total_evenements ?? events.length} />
            <Tuile titre="Visages identifiés" valeur={stats?.visages_connus_count ?? '—'} couleur="text-[#1D8A57]" />
            <Tuile
              titre="Inconnus & Alertes"
              valeur={stats ? (stats.inconnus_count || 0) + (stats.mouvements_count || 0) : '—'}
              couleur="text-[#E63946]"
            />
            <Tuile titre="Critiques (ML)" valeur={stats?.critiques_count ?? '—'} couleur="text-[#00838F]" />
          </div>

          {/* ── Barre de Filtres & Recherche ── */}
          <div className="bg-white border border-[#D8DEE4] rounded-2xl p-4 shadow-xs flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
            {/* Recherche */}
            <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Rechercher par description, personne, zone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#FBFBFC] border border-[#D8DEE4] rounded-xl px-4 py-2 text-xs text-[#0B1F3A] placeholder-[#8FA3B8] focus:outline-none focus:ring-2 focus:ring-[#00C2CB] transition pl-9"
              />
              <svg
                className="w-4 h-4 text-[#8FA3B8] absolute left-3 top-2.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </form>

            {/* Filtres par listes déroulantes */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-[#FBFBFC] border border-[#D8DEE4] rounded-xl px-3 py-2 text-xs font-medium text-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#00C2CB] cursor-pointer"
              >
                <option value="">Tous les types</option>
                <option value="visage_connu">Visages Connus</option>
                <option value="inconnu">Personnes Inconnues</option>
                <option value="mouvement">Mouvements Suspects</option>
              </select>

              <select
                value={criticiteFilter}
                onChange={(e) => {
                  setCriticiteFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-[#FBFBFC] border border-[#D8DEE4] rounded-xl px-3 py-2 text-xs font-medium text-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#00C2CB] cursor-pointer"
              >
                <option value="">Toutes criticités</option>
                <option value="eleve">Élevé (Critique)</option>
                <option value="moyen">Moyen (Vigilance)</option>
                <option value="faible">Faible (Normal)</option>
              </select>

              {(typeFilter || criticiteFilter || searchTerm) && (
                <button
                  onClick={() => {
                    setTypeFilter('');
                    setCriticiteFilter('');
                    setSearchTerm('');
                    setPage(1);
                  }}
                  className="text-xs font-bold text-[#00838F] hover:underline px-2 py-1 cursor-pointer"
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>

          {/* ── Liste des Événements (Tableau clair) ── */}
          {loading ? (
            <div className="text-center py-20 bg-white rounded-2xl border border-[#D8DEE4] shadow-xs">
              <div className="w-10 h-10 border-4 border-[#00C2CB] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-[#8FA3B8]">Chargement des événements de surveillance...</p>
            </div>
          ) : events.length === 0 ? (
            <div className="bg-white border border-[#D8DEE4] rounded-2xl p-12 text-center shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-[#E4F8F9] text-[#00838F] flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#0B1F3A] mb-1">Aucun événement trouvé</h3>
              <p className="text-sm text-[#4A5568] max-w-sm mx-auto mb-6">
                Aucune détection ne correspond aux filtres sélectionnés. Vous pouvez lancer une simulation pour tester le système.
              </p>
              <button
                onClick={() => handleSimulate('inconnu')}
                className="px-5 py-2.5 bg-[#00838F] hover:bg-[#006B75] text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer"
              >
                Simuler un événement test
              </button>
            </div>
          ) : (
            <div className="bg-white border border-[#D8DEE4] rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#F0F2F5] bg-[#FBFBFC] text-[#8FA3B8] uppercase tracking-wider font-bold">
                      <th className="py-3.5 px-6">Type</th>
                      <th className="py-3.5 px-6">Zone</th>
                      <th className="py-3.5 px-6">Description (Gemini)</th>
                      <th className="py-3.5 px-6">Criticité</th>
                      <th className="py-3.5 px-6">Date &amp; Heure</th>
                      <th className="py-3.5 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F2F5]">
                    {events.map((ev) => (
                      <tr
                        key={ev.id}
                        onClick={() => setSelectedEvent(ev)}
                        className="hover:bg-[#FBFBFC] transition cursor-pointer group"
                      >
                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {getTypeBadge(ev.type)}
                            {ev.alerte_declenchee && (
                              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Alerte déclenchée" />
                            )}
                          </div>
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap font-bold text-[#0B1F3A]">
                          {ev.zone_nom || ev.zone_nom_fallback}
                        </td>

                        <td className="py-4 px-6 max-w-md truncate text-[#4A5568]">
                          {ev.description || '—'}
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {getCriticiteBadge(ev.niveau_criticite)}
                            <span className="text-[11px] text-[#8FA3B8] font-mono">
                              {Math.round(ev.score_criticite * 100)}%
                            </span>
                          </div>
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap text-[#8FA3B8]">
                          {new Date(ev.date_heure).toLocaleString('fr-FR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>

                        <td className="py-4 px-6 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(ev);
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#00838F] hover:bg-[#006B75] text-white transition cursor-pointer"
                              title="Consulter les détails"
                            >
                              Détails
                            </button>
                            <button
                              onClick={(e) => handleDelete(ev.id, e)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 text-[#C22B36] hover:bg-red-50 transition cursor-pointer"
                              title="Supprimer"
                            >
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-4 border-t border-[#F0F2F5] flex items-center justify-between text-xs text-[#8FA3B8]">
                  <span>Page {page} sur {totalPages}</span>
                  <div className="flex gap-2">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                      className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] font-semibold hover:bg-gray-50 disabled:opacity-40 transition cursor-pointer"
                    >
                      Précédent
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                      className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] font-semibold hover:bg-gray-50 disabled:opacity-40 transition cursor-pointer"
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Modal de Détail */}
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
      </div>
    </div>
  );
}
