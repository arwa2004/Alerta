import React, { useState, useEffect } from 'react';
import eventsApi from '../api/eventsApi';

export default function EventDetailModal({ event, onClose, onEventUpdated }) {
  if (!event) return null;

  const isDetailedDesc = event.description && (
    event.description.includes('caméra') ||
    event.description.includes('silhouette') ||
    event.description.includes('capturé') ||
    event.description.includes('passage') ||
    event.description.length > 70
  );

  const [description, setDescription] = useState(event.description || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [hasGeminiAnalyzed, setHasGeminiAnalyzed] = useState(Boolean(isDetailedDesc));
  const [cooldown, setCooldown] = useState(0);
  const [currentImageUrl, setCurrentImageUrl] = useState(
    event.image_reconstituee
      ? (event.image_reconstituee.startsWith('http')
          ? event.image_reconstituee
          : `http://127.0.0.1:8000${event.image_reconstituee}`)
      : null
  );
  const [currentImageSource, setCurrentImageSource] = useState(event.image_source || 'simulation');
  const [errorMsg, setErrorMsg] = useState('');

  // Gestionnaire de décompte pour le quota gratuit Pollinations (45s)
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const getTypeBadge = (type) => {
    switch (type) {
      case 'visage_connu':
        return {
          label: 'Visage Connu',
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          dot: 'bg-emerald-400',
        };
      case 'inconnu':
      case 'visage_inconnu':
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
      case 'critique':
        return { label: 'Critique (Élevé)', color: 'text-rose-400', barBg: 'bg-rose-500' };
      case 'moyen':
      case 'moderee':
        return { label: 'Vigilance (Moyen)', color: 'text-amber-400', barBg: 'bg-amber-500' };
      default:
        return { label: 'Normal (Faible)', color: 'text-emerald-400', barBg: 'bg-emerald-500' };
    }
  };

  const handleTriggerGemini = async () => {
    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const updated = await eventsApi.analyserAvecGemini(event.id);
      setDescription(updated.description);
      setHasGeminiAnalyzed(true);
      if (onEventUpdated) {
        onEventUpdated(updated);
      }
    } catch (err) {
      console.error('Erreur analyse Gemini', err);
      setErrorMsg('Impossible de contacter Gemini pour le moment. Veuillez réessayer.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenererImage = async () => {
    setIsGeneratingImage(true);
    setErrorMsg('');
    try {
      const updated = await eventsApi.genererImage(event.id);
      if (updated.ia_success === false) {
        // En cas de rate-limit (402), avertir l'utilisateur sans écraser l'image
        setErrorMsg(updated.ia_message || "Limite temporaire atteinte. Votre image actuelle est conservée.");
        setCooldown(30);
        return;
      }

      if (updated.image_reconstituee) {
        const url = updated.image_reconstituee.startsWith('http')
          ? updated.image_reconstituee
          : `http://127.0.0.1:8000${updated.image_reconstituee}`;
        setCurrentImageUrl(url + '?t=' + Date.now());
      }
      setCurrentImageSource(updated.image_source || 'ia_ouverte');
      setCooldown(45); // Cooldown de 45s imposé par le niveau gratuit
      if (onEventUpdated) onEventUpdated(updated);
    } catch (err) {
      console.error('Erreur génération image', err);
      setErrorMsg("Erreur lors de la génération. L'image précédente est conservée.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const typeInfo = getTypeBadge(event.type);
  const critInfo = getCriticiteBadge(event.niveau_criticite);
  const formattedDate = new Date(event.date_heure).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const imageUrl = currentImageUrl;
  const isHfImage = currentImageSource === 'hf';
  const isOpenAiImage = currentImageSource === 'ia_ouverte';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0b1329] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#111e3d]/80">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${typeInfo.bg}`}>
              <span className={`w-2 h-2 rounded-full ${typeInfo.dot}`}></span>
              {typeInfo.label}
            </span>
            <span className="text-xs text-slate-400 font-mono">Incident #{event.id}</span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenu défilant */}
        <div className="p-6 overflow-y-auto space-y-6">

          {/* RECONSTITUTION VISUELLE DE LA SCÈNE */}
          <div className="relative rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video flex items-center justify-center shadow-inner">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Reconstitution visuelle de la scène"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center p-6 text-slate-500">
                <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-sm">Image illustrative en cours de génération</p>
              </div>
            )}

            {/* Bandeau d'information Reconstitution */}
            <div className="absolute top-3 left-3 bg-slate-950/85 backdrop-blur-md px-3 py-1 rounded-md text-[11px] font-mono border flex items-center gap-2 border-cyan-500/40 text-cyan-300">
              <span className={`w-2 h-2 rounded-full ${isHfImage ? 'bg-cyan-400' : isOpenAiImage ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
              {isHfImage
                ? 'Reconstitution IA (Hugging Face)'
                : isOpenAiImage
                ? 'Reconstitution IA (Moteur FLUX.1)'
                : 'Reconstitution de la scène (Simulation)'}
            </div>

            <div className="absolute bottom-3 right-3 bg-black/75 px-2.5 py-0.5 rounded text-[10px] font-mono text-slate-300">
              Zone : {event.zone_nom || event.zone_nom_fallback || 'Secteur'} • Image illustrative
            </div>
          </div>

          {/* SECTION ANALYSE IA GEMINI (DÉCLENCHÉE AVEC LE BOUTON) */}
          <div className="p-5 rounded-xl bg-gradient-to-r from-slate-900 to-[#0e1a38] border border-cyan-500/30 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-wider">
                <svg className="w-4 h-4 text-[#00C2CB]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Analyse & Recommandation Gemini
              </div>

              {hasGeminiAnalyzed && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Analysé par Gemini IA
                </span>
              )}
            </div>

            {/* Texte de description ou analyse */}
            <div className="min-h-[50px] mb-4">
              {isAnalyzing ? (
                <div className="flex items-center gap-3 py-3 text-cyan-300 text-sm">
                  <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>Gemini analyse les métadonnées de l'incident et rédige le rapport de sécurité...</span>
                </div>
              ) : (
                <p className="text-slate-200 text-sm leading-relaxed">
                  {description || "Aucun rapport généré. Cliquez sur le bouton ci-dessous pour déclencher l'analyse Gemini."}
                </p>
              )}
              {errorMsg && (
                <p className="text-xs text-rose-400 mt-2">{errorMsg}</p>
              )}
            </div>

            {/* BOUTON DÉDIÉ POUR DÉCLENCHER GEMINI */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {hasGeminiAnalyzed
                    ? "Description de scène générée par l'IA."
                    : "Déclenchez l'IA pour décrire la scène de l'incident."}
                </span>
                <button
                  onClick={handleTriggerGemini}
                  disabled={isAnalyzing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-900 bg-gradient-to-r from-[#00C2CB] to-cyan-300 hover:from-cyan-300 hover:to-cyan-200 shadow-md shadow-cyan-500/20 transition disabled:opacity-50 cursor-pointer"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                      Analyse en cours...
                    </>
                  ) : hasGeminiAnalyzed ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Réanalyser avec Gemini
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Générer la description Gemini
                    </>
                  )}
                </button>
              </div>

              {/* BOUTON POUR GÉNÉRER L'IMAGE DEPUIS LA DESCRIPTION IA */}
              {hasGeminiAnalyzed && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/40">
                  <span className="text-xs text-slate-400">
                    {isGeneratingImage
                      ? "Génération FLUX.1 en cours..."
                      : cooldown > 0
                      ? `Attendez ${cooldown}s avant de régénérer (limite gratuite).`
                      : (currentImageSource === 'ia_ouverte' || currentImageSource === 'hf')
                      ? "Image IA générée. Vous pouvez régénérer une autre variante."
                      : "Générez une image de reconstitution basée sur la description ci-dessus."}
                  </span>
                  <button
                    onClick={handleGenererImage}
                    disabled={isGeneratingImage || cooldown > 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-500 hover:to-fuchsia-400 shadow-md shadow-violet-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isGeneratingImage ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Image en cours...
                      </>
                    ) : cooldown > 0 ? (
                      <>
                        <svg className="w-3.5 h-3.5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Disponible dans {cooldown}s
                      </>
                    ) : (currentImageSource === 'ia_ouverte' || currentImageSource === 'hf') ? (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Régénérer une variante IA
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Générer l'image depuis cette description
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Jauge du Score de Criticité */}
          <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">Niveau de Risque & Gravité</span>
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
              <span className="block text-xs text-slate-400 mb-1">Zone sous surveillance</span>
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
              <span className="block text-xs text-slate-400 mb-1">Origine de l'image</span>
              <span className="font-semibold text-xs flex items-center gap-1.5">
                {isHfImage ? (
                  <span className="text-cyan-400 font-bold">Hugging Face (Inference)</span>
                ) : isOpenAiImage ? (
                  <span className="text-emerald-400 font-bold">IA Générative (Moteur FLUX.1)</span>
                ) : (
                  <span className="text-amber-400 font-medium">Reconstitution Simulation</span>
                )}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800">
              <span className="block text-xs text-slate-400 mb-1">Indice Reconnaissance (M1)</span>
              <span className="font-semibold text-cyan-300">
                {Math.round(event.score_confiance * 100)}% <span className="text-[10px] text-slate-400 font-normal">(Simulé)</span>
              </span>
            </div>
          </div>

          {/* Déclenchement Module 4 */}
          {event.alerte_declenchee && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <span className="p-2 rounded-lg bg-rose-500/20 text-rose-400 font-bold">M4</span>
              <div>
                <p className="font-semibold text-rose-200">Alerte synchronisée avec le Module 4 (Voix & Alarme)</p>
                <p className="text-slate-400">Diffusion d'un avertissement prioritaire.</p>
              </div>
            </div>
          )}
        </div>

        {/* Pied de page */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
