import React, { useState, useEffect } from 'react';
import eventsApi from '../api/eventsApi';
import EventDetailModal from '../components/EventDetailModal';
import Navbar from '../components/Navbar';

export default function Events() {
  const [events, setEvents] = useState([]);
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

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params = {
        page,
      };
      if (typeFilter) params.type = typeFilter;
      if (criticiteFilter) params.niveau_criticite = criticiteFilter;
      if (searchTerm) params.search = searchTerm;

      const data = await eventsApi.getEvenements(params);
      if (data.results) {
        setEvents(data.results);
        setTotalPages(Math.ceil((data.count || 1) / 10));
      } else {
        setEvents(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Erreur chargement événements', err);
    } finally {
      setLoading(false);
    }
  };

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
      // Rechargement immédiat
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
    } catch (err) {
      console.error('Erreur suppression', err);
      alert('Impossible de supprimer cet événement.');
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'visage_connu':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Visage Connu</span>;
      case 'inconnu':
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">Inconnu</span>;
      default:
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Mouvement</span>;
    }
  };

  const getCriticiteBadge = (niveau) => {
    switch (niveau) {
      case 'eleve':
        return <span className="px-2 py-0.5 text-xs font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">Élevé</span>;
      case 'moyen':
        return <span className="px-2 py-0.5 text-xs font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">Moyen</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Faible</span>;
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1329] text-slate-100 font-sans flex flex-col">
      <Navbar activeTab="evenements" />
      <div className="p-6 md:p-10 flex-1">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Titre & Barre d'actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold tracking-wider uppercase mb-1">
              <span>Module 3</span>
              <span>•</span>
              <span>Surveillance Intelligente</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Événements & Détections IA
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Historique complet des détections enrichies par Gemini, reconstitution par Hugging Face et scoring ML.
            </p>
          </div>

          {/* Boutons de simulation de scénario */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Input upload photo pour simuler une capture caméra du Module 2 */}
            <div className="flex items-center gap-2 bg-[#111a36] px-3 py-1.5 rounded-xl border border-slate-700/80">
              <label className="text-xs text-cyan-400 font-semibold cursor-pointer flex items-center gap-1.5 hover:text-cyan-300">
                <span>📷 {photoCapturee ? photoCapturee.name.slice(0, 15) + '...' : 'Attacher une photo'}</span>
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
                  className="text-slate-400 hover:text-rose-400 text-xs font-bold"
                  title="Retirer la photo"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 hidden sm:inline">Simuler :</span>
              <button
                onClick={() => handleSimulate('inconnu')}
                disabled={simulating}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                + Inconnu
              </button>
              <button
                onClick={() => handleSimulate('visage_connu')}
                disabled={simulating}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                + Visage Connu
              </button>
              <button
                onClick={() => handleSimulate('mouvement')}
                disabled={simulating}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                + Mouvement
              </button>
            </div>
          </div>
        </div>

        {/* Barre de Filtres & Recherche */}
        <div className="bg-[#111a36] border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center shadow-lg">
          {/* Recherche */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Rechercher par description, personne, zone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0b1329] border border-slate-700/80 rounded-xl px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition pl-10"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </form>

          {/* Filtres par pilules */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Type */}
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="bg-[#0b1329] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
            >
              <option value="">Tous les types</option>
              <option value="visage_connu">Visages Connus</option>
              <option value="inconnu">Personnes Inconnues</option>
              <option value="mouvement">Mouvements Suspects</option>
            </select>

            {/* Criticité ML */}
            <select
              value={criticiteFilter}
              onChange={(e) => {
                setCriticiteFilter(e.target.value);
                setPage(1);
              }}
              className="bg-[#0b1329] border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
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
                className="text-xs text-cyan-400 hover:text-cyan-300 underline px-2 py-1"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        {/* Liste des Événements */}
        {loading ? (
          <div className="text-center py-20">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-sm text-slate-400">Chargement des événements de surveillance...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="bg-[#111a36] border border-slate-800 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-500">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Aucun événement trouvé</h3>
            <p className="text-sm text-slate-400 max-w-sm mx-auto mb-6">
              Aucune détection ne correspond aux filtres sélectionnés. Vous pouvez lancer une simulation pour tester le système.
            </p>
            <button
              onClick={() => handleSimulate('inconnu')}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold text-sm rounded-xl transition shadow-lg shadow-cyan-500/20"
            >
              Simuler un événement test
            </button>
          </div>
        ) : (
          <div className="bg-[#111a36] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-900/60 text-xs text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-4 px-6">Type</th>
                    <th className="py-4 px-6">Zone</th>
                    <th className="py-4 px-6">Description (Gemini)</th>
                    <th className="py-4 px-6">Criticité</th>
                    <th className="py-4 px-6">Date & Heure</th>
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-sm">
                  {events.map((ev) => (
                    <tr
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className="hover:bg-slate-800/30 transition cursor-pointer group"
                    >
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getTypeBadge(ev.type)}
                          {ev.alerte_declenchee && (
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Alerte déclenchée"></span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-6 whitespace-nowrap font-medium text-slate-200">
                        {ev.zone_nom || ev.zone_nom_fallback}
                      </td>

                      <td className="py-4 px-6 max-w-md truncate text-slate-300">
                        {ev.description || "—"}
                      </td>

                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getCriticiteBadge(ev.niveau_criticite)}
                          <span className="text-xs text-slate-400 font-mono">
                            {Math.round(ev.score_criticite * 100)}%
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-6 whitespace-nowrap text-xs text-slate-400">
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
                            className="p-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition"
                            title="Consulter les détails"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => handleDelete(ev.id, e)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                            title="Supprimer"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
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
              <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <span>Page {page} sur {totalPages}</span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition"
                  >
                    Précédent
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition"
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
              fetchEvents(page);
            }}
          />
        )}
      </div>
      </div>
    </div>
  );
}
