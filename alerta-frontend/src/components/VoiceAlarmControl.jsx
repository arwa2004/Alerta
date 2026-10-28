import { useState, useEffect, useRef } from 'react';
import eventsApi from '../api/eventsApi';

// Effet sonore synthétisé Web Audio ultra-rapide (< 80ms)
const playSoundEffect = (type) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'disarm') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'arm') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (type === 'siren') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (err) {
    console.debug('Audio not supported:', err);
  }
};

// Synthèse vocale navigateur (réponse immédiate et fluide)
const speakFeedback = (text) => {
  if (!window.speechSynthesis || !text) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 1.2; // Débit vif et naturel
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.debug('SpeechSynthesis error:', e);
  }
};

export default function VoiceAlarmControl({ onAlarmChange }) {
  const [alarmState, setAlarmState] = useState({
    est_active: true,
    est_declenchee: false,
    derniere_commande: '',
    derniere_action: '',
    source_transcription: 'whisper_huggingface',
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const lastRecognizedRef = useRef('');
  const silenceTimerRef = useRef(null);
  const autoStopTimeoutRef = useRef(null);

  // Charger le statut au montage
  const loadStatus = async () => {
    try {
      const data = await eventsApi.getAlarmeStatus();
      setAlarmState(data);
      if (onAlarmChange) onAlarmChange(data);
    } catch (e) {
      console.debug('Statut alarme indisponible:', e);
    }
  };

  useEffect(() => {
    loadStatus();
    const timer = setInterval(loadStatus, 8000);
    return () => clearInterval(timer);
  }, []);

  // Action manuelle instantanée
  const handleManualAction = async (action) => {
    setProcessing(true);
    try {
      const data = await eventsApi.setAlarmeAction(action);
      setAlarmState(data);
      if (action === 'desarmer') {
        playSoundEffect('disarm');
        speakFeedback('Alarme générale désactivée.');
      } else if (action === 'armer') {
        playSoundEffect('arm');
        speakFeedback('Alarme armée.');
      } else if (action === 'declencher') {
        playSoundEffect('siren');
        speakFeedback("Alerte d'urgence activée.");
      }
      if (onAlarmChange) onAlarmChange(data);
    } catch (err) {
      console.error('Erreur alarme manuelle:', err);
    } finally {
      setProcessing(false);
    }
  };

  // Démarrer l'enregistrement vocal ultra-réactif
  const startRecording = async () => {
    setIsRecording(true);
    setLiveTranscript('');
    lastRecognizedRef.current = '';
    setStatusMessage('Écoute active... Parlez');
    audioChunksRef.current = [];

    // Détection temps réel zéro-latence
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      try {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new SpeechRec();
        rec.lang = 'fr-FR';
        rec.continuous = true;
        rec.interimResults = true;

        rec.onresult = (evt) => {
          let text = '';
          for (let i = 0; i < evt.results.length; i++) {
            text += evt.results[i][0].transcript;
          }
          setLiveTranscript(text);
          lastRecognizedRef.current = text;

          const lower = text.toLowerCase();
          const hasKeyword = ['desactiv', 'activ', 'coup', 'stop', 'silence', 'urgenc', 'statut'].some(k => lower.includes(k));

          // Coupure ultra-rapide (80ms après mot-clé, 250ms sinon)
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            stopRecording();
          }, hasKeyword ? 80 : 250);
        };

        rec.onspeechend = () => {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            stopRecording();
          }, 60);
        };

        rec.start();
        recognitionRef.current = rec;
      } catch (e) {
        console.debug('WebSpeech error:', e);
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendVoiceCommand(blob);
      };

      recorder.start();

      // Arrêt automatique maximal réduit à 2.2s
      autoStopTimeoutRef.current = setTimeout(() => {
        if (recorder.state === 'recording') {
          stopRecording();
        }
      }, 2200);
    } catch (err) {
      console.error('Erreur accès micro:', err);
      setIsRecording(false);
      setStatusMessage('Accès micro refusé ou non disponible.');
    }
  };

  // Arrêter l'enregistrement
  const stopRecording = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (autoStopTimeoutRef.current) clearTimeout(autoStopTimeoutRef.current);

    setIsRecording(false);
    setStatusMessage('Exécution...');

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.debug(e);
      }
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  // Exécution ultra-rapide instantanée (< 50ms)
  const sendVoiceCommand = async (audioBlob) => {
    setProcessing(true);
    try {
      const recognized = (lastRecognizedRef.current || liveTranscript || '').trim();

      let result;
      // Si la phrase a été capturée, envoi en JSON pur direct (quelques millisecondes)
      if (recognized.length > 0) {
        result = await eventsApi.envoyerCommandeVocale(recognized);
      } else if (audioBlob && audioBlob.size > 0) {
        const fd = new FormData();
        fd.append('audio', audioBlob, 'commande.webm');
        result = await eventsApi.envoyerCommandeVocale(fd);
      } else {
        setStatusMessage('Aucun son détecté. Réessayez.');
        setProcessing(false);
        return;
      }

      setAlarmState((prev) => ({
        ...prev,
        est_active: result.est_active,
        est_declenchee: result.est_declenchee,
        derniere_commande: result.transcription,
        derniere_action: result.action_label,
        source_transcription: result.source_ia,
      }));

      setStatusMessage(`« ${result.transcription} » → ${result.action_label}`);

      // Sons et voix de confirmation immédiats
      if (result.action === 'alarme_desactivee') {
        playSoundEffect('disarm');
      } else if (result.action === 'alarme_activee') {
        playSoundEffect('arm');
      } else if (result.action === 'alarme_declenchee_urgence') {
        playSoundEffect('siren');
      }

      if (result.message_vocal) {
        speakFeedback(result.message_vocal);
      }

      if (onAlarmChange) onAlarmChange(result);

      // Fermeture rapide et élégante (600ms)
      setTimeout(() => {
        setModalOpen(false);
      }, 650);
    } catch (err) {
      console.error('Erreur commande vocale:', err);
      setStatusMessage("Erreur d'exécution. Utilisez les boutons.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      {/* ── PILL NAVBAR : État de l'alarme & Bouton Micro ── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setModalOpen(true)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-xs ${
            alarmState.est_declenchee
              ? 'bg-rose-500/20 text-rose-300 border-rose-500 animate-pulse'
              : alarmState.est_active
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
          }`}
          title="Contrôle vocal & Statut Alarme (Module 4)"
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              alarmState.est_declenchee
                ? 'bg-rose-500 animate-ping'
                : alarmState.est_active
                ? 'bg-emerald-400'
                : 'bg-slate-400'
            }`}
          />
          <span className="hidden md:inline">
            {alarmState.est_declenchee
              ? 'Sirène Active !'
              : alarmState.est_active
              ? 'Alarme Armée'
              : 'Alarme Désarmée'}
          </span>
          <span className="p-1 rounded-md bg-white/10 text-white flex items-center justify-center">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </span>
        </button>
      </div>

      {/* ── MODALE INTERACTIVE COMMANDE VOCALE (MODULE 4) ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-[#0B1F3A] to-[#122b52] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-400/20 text-[#00C2CB] flex items-center justify-center font-bold">
                  M4
                </div>
                <div>
                  <h3 className="font-bold text-sm">Contrôle Vocal &amp; Alarme</h3>
                  <p className="text-[11px] text-[#B8C7D9]">IA Whisper (Hugging Face) • Réponse instantanée</p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Contenu */}
            <div className="p-6 text-center space-y-5">
              {/* Statut Alarme actuel */}
              <div
                className={`p-3 rounded-2xl border flex items-center justify-between text-xs font-semibold ${
                  alarmState.est_declenchee
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : alarmState.est_active
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      alarmState.est_declenchee
                        ? 'bg-rose-500 animate-pulse'
                        : alarmState.est_active
                        ? 'bg-emerald-500'
                        : 'bg-slate-400'
                    }`}
                  />
                  <span>
                    État :{' '}
                    <strong>
                      {alarmState.est_declenchee
                        ? 'SIRÈNE DÉCLENCHÉE'
                        : alarmState.est_active
                        ? 'ARMÉE ET ACTIVE'
                        : 'DÉSARMÉE'}
                    </strong>
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-normal">
                  {alarmState.derniere_action || 'Prêt'}
                </span>
              </div>

              {/* Bouton Microphone central géant avec animations */}
              <div className="py-4 flex flex-col items-center justify-center">
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={processing}
                  className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg ${
                    isRecording
                      ? 'bg-rose-500 text-white ring-8 ring-rose-200 animate-pulse scale-105'
                      : processing
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-[#00C2CB] text-[#0B1F3A] hover:bg-[#00a8b0] hover:scale-105'
                  }`}
                >
                  {isRecording ? (
                    <div className="flex flex-col items-center gap-1">
                      <span className="w-5 h-5 rounded-xs bg-white" />
                      <span className="text-[10px] font-bold uppercase">Arrêter</span>
                    </div>
                  ) : processing ? (
                    <svg className="w-8 h-8 animate-spin text-slate-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                      />
                    </svg>
                  )}
                </button>

                <p className="mt-3 text-xs font-semibold text-slate-700">
                  {isRecording
                    ? '🎙️ Parlez maintenant (coupure auto immédiate)'
                    : processing
                    ? 'Exécution...'
                    : 'Cliquez pour parler'}
                </p>
              </div>

              {/* Transcription en direct / Message */}
              {(liveTranscript || statusMessage) && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-left animate-in fade-in duration-75">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                    Transcription IA
                  </p>
                  <p className="text-xs text-slate-800 font-semibold italic">
                    « {liveTranscript || statusMessage} »
                  </p>
                </div>
              )}

              {/* Suggestions de commandes vocales */}
              <div className="text-left bg-cyan-50/60 p-3 rounded-2xl border border-cyan-100 space-y-1.5">
                <p className="text-[11px] font-bold text-[#00838F] uppercase tracking-wide">
                  💡 Commandes vocales reconnues :
                </p>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-500">✔</span> « Active l'alarme »
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-rose-500">✖</span> « Désactive l'alarme »
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-500">🔇</span> « Couper la sirène »
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-blue-500">❓</span> « Quel est le statut »
                  </div>
                </div>
              </div>

              {/* Raccourcis manuels rapides */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleManualAction(alarmState.est_active ? 'desarmer' : 'armer')}
                  disabled={processing}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                    alarmState.est_active
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  }`}
                >
                  {alarmState.est_active ? 'Désarmer manuellement' : 'Armer manuellement'}
                </button>
                <button
                  type="button"
                  onClick={() => handleManualAction('declencher')}
                  disabled={processing}
                  className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  🚨 SOS Urgence
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
