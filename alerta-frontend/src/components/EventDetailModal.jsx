import React from 'react';

export default function EventDetailModal({ event, onClose }) {
  if (!event) return null;

  const getTypeBadge = (type) => {
    switch (type) {
      case 'visage_connu':
        return {
          label: 'Visage Connu',
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          dot: 'bg-emerald-400',
        };
      case 'inconnu':
        return {
          label: 'Personne Inconnue',
          bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
          dot: 'bg-rose-400',
        };
      default:
        return {
          label: 'Mouvement Suspect',
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          dot: 'bg-amber-400',
        };
    }
  };

  const getCriticiteBadge = (niveau) => {
    switch (niveau) {
      case 'eleve':
        return { label: 'Critique (Élevé)', color: 'text-rose-400', barBg: 'bg-rose-500' };
      case 'moyen':
        return { label: 'Vigilance (Moyen)', color: 'text-amber-400', barBg: 'bg-amber-500' };
      default:
        return { label: 'Normal (Faible)', color: 'text-emerald-400', barBg: 'bg-emerald-500' };
    }
  };

  const typeInfo = getTypeBadge(event.type);
  const critInfo = getCriticiteBadge(event.niveau_criticite);
  const formattedDate = new Date(event.date_heure).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#1e293b]/50">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${typeInfo.bg}`}>
              <span className={`w-2 h-2 rounded-full ${typeInfo.dot}`}></span>
              {typeInfo.label}
            </span>
            <span className="text-xs text-slate-400 font-mono">#{event.id}</span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenu avec scroll */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Image de reconstitution IA */}
          <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
            {event.image_reconstituee ? (
              <img
                src={event.image_reconstituee.startsWith('http') ? event.image_reconstituee : `http://127.0.0.1:8000${event.image_reconstituee}`}
                alt="Reconstitution de la scène"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center p-6 text-slate-500">
                <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">Image en cours de génération ou non disponible</p>
              </div>
            )}
            <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-mono text-cyan-400 border border-cyan-500/30">
              ● Reconstitution IA (Hugging Face)
            </div>
          </div>

          {/* Description générée par Gemini */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/20 to-blue-950/20 border border-cyan-800/40">
            <div className="flex items-center gap-2 mb-1.5 text-xs font-semibold text-cyan-400 uppercase tracking-wider">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Synthèse IA Générative (Gemini)
            </div>
            <p className="text-slate-200 text-sm leading-relaxed italic">
              « {event.description || "Aucune description générée."} »
            </p>
          </div>

          {/* Jauge du Score de Criticité ML */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">Score de Criticité (Modèle ML)</span>
              <span className={`text-sm font-bold ${critInfo.color}`}>
                {critInfo.label} — {Math.round(event.score_criticite * 100)}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${critInfo.barBg} transition-all duration-700`}
                style={{ width: `${Math.max(5, Math.min(100, Math.round(event.score_criticite * 100)))}%` }}
              ></div>
            </div>
          </div>

          {/* Métadonnées & Paramètres sous forme de grille */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800">
              <span className="block text-xs text-slate-400 mb-1">Zone surveillée</span>
              <span className="font-semibold text-slate-200 flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                {event.zone_nom || event.zone_nom_fallback}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800">
              <span className="block text-xs text-slate-400 mb-1">Horodatage précis</span>
              <span className="font-semibold text-slate-200 flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formattedDate}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800">
              <span className="block text-xs text-slate-400 mb-1">Personne identifiée</span>
              <span className="font-semibold text-slate-200">
                {event.personne_nom ? (
                  <span className="text-emerald-400 font-bold">{event.personne_nom}</span>
                ) : (
                  <span className="text-slate-400 italic">Non répertoriée</span>
                )}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800">
              <span className="block text-xs text-slate-400 mb-1">Confiance Reconnaissance Faciale</span>
              <span className="font-semibold text-cyan-300">
                {Math.round(event.score_confiance * 100)}%
              </span>
            </div>
          </div>

          {/* Déclenchement Module 4 */}
          {event.alerte_declenchee && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <span className="p-2 rounded-lg bg-rose-500/20 text-rose-400 font-bold">M4</span>
              <div>
                <p className="font-semibold text-rose-200">Alerte envoyée au Module 4 (Voix & Alarme)</p>
                <p className="text-slate-400">Déclenchement immédiat de notification prioritaire.</p>
              </div>
            </div>
          )}
        </div>

        {/* Pied de page */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
