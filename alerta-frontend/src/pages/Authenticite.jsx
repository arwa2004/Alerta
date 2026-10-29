import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listerAnalyses, detailAnalyse, televerserAnalyse, supprimerAnalyse, reanalyserAnalyse,
} from '../api/authenticite';
import { STATUTS, Tuile, formaterTaille, formaterDate } from './Medias';
import { VERDICTS, ModaleAuthenticite } from '../components/authenticite/ResultatAuthenticite';

const aplatir = (d) => {
  if (!d) return '';
  if (typeof d === 'string') return d;
  return Object.values(d).flat().map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(' ');
};

export default function Authenticite() {
  const [analyses, setAnalyses] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [survol, setSurvol] = useState(false);
  const [detail, setDetail] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);
  const champFichier = useRef(null);

  const charger = useCallback(() =>
    listerAnalyses()
      .then((r) => setAnalyses(r.data.results ?? r.data))
      .catch(() => setErreur("Impossible de charger les analyses."))
      .finally(() => setChargement(false)), []);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (!analyses.some((a) => ['en_attente', 'en_cours'].includes(a.statut))) return undefined;
    const minuterie = setInterval(charger, 3000);
    return () => clearInterval(minuterie);
  }, [analyses, charger]);

  const envoyer = async (fichiers) => {
    if (!fichiers.length) return;
    setErreur('');
    setEnvoi(true);
    for (const f of fichiers) {
      try {
        await televerserAnalyse(f);
      } catch (err) {
        setErreur(`${f.name} : ${aplatir(err.response?.data) || "échec de l'envoi."}`);
      }
    }
    await charger();
    setEnvoi(false);
  };

  const ouvrir = (id) => detailAnalyse(id).then((r) => setDetail(r.data)).catch(() => setErreur('Détails indisponibles.'));
  const relancer = (id) => reanalyserAnalyse(id).then(charger).catch(() => setErreur('Réanalyse impossible.'));

  const confirmerSuppression = async () => {
    const id = aSupprimer;
    setASupprimer(null);
    try {
      await supprimerAnalyse(id);
      if (detail?.id === id) setDetail(null);
      charger();
    } catch {
      setErreur('Suppression impossible.');
    }
  };

  const termines = analyses.filter((a) => a.statut === 'termine');
  const nbSuspects = termines.filter((a) => a.verdict !== 'authentique').length;
  const nbEnCours = analyses.filter((a) => ['en_attente', 'en_cours'].includes(a.statut)).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#0B1F3A]">Authenticité des médias</h2>
        <p className="text-sm text-[#4A5568] mt-1">
          Envoyez une photo ou une vidéo : Alerta estime si elle a été retouchée ou générée par IA.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Tuile titre="Analyses" valeur={analyses.length} />
        <Tuile titre="Authentiques" valeur={termines.length - nbSuspects} couleur="text-green-700" />
        <Tuile titre="Suspects / retouchés" valeur={nbSuspects} couleur={nbSuspects ? 'text-[#E63946]' : 'text-[#0B1F3A]'} />
        <Tuile titre="En cours" valeur={nbEnCours} couleur="text-[#00838F]" />
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); envoyer([...e.dataTransfer.files]); }}
        onClick={() => champFichier.current?.click()}
        className={`cursor-pointer rounded-3xl border-2 border-dashed p-8 text-center transition ${
          survol ? 'border-[#00C2CB] bg-[#E4F8F9]' : 'border-[#BFD0D9] bg-white hover:border-[#00C2CB]'}`}
      >
        <input ref={champFichier} type="file" multiple className="hidden"
          accept="image/jpeg,image/png,video/mp4,video/x-msvideo,video/quicktime,video/x-matroska"
          onChange={(e) => { envoyer([...e.target.files]); e.target.value = ''; }} />
        <p className="font-bold text-[#0B1F3A]">
          {envoi ? 'Envoi en cours…' : 'Glissez une image ou une vidéo ici, ou cliquez pour parcourir'}
        </p>
        <p className="text-xs text-[#4A5568] mt-1">JPG, PNG (10 Mo max) · MP4, AVI, MOV, MKV (200 Mo max)</p>
      </div>

      {erreur && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-[#E63946] text-sm font-medium px-4 py-3 flex justify-between gap-3">
          <span>{erreur}</span>
          <button type="button" onClick={() => setErreur('')} className="font-bold cursor-pointer">×</button>
        </div>
      )}

      {chargement ? (
        <p className="text-center text-sm text-[#4A5568] py-10">Chargement…</p>
      ) : analyses.length === 0 ? (
        <p className="text-center text-sm text-[#4A5568] py-10">Aucune analyse pour le moment.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {analyses.map((a) => {
            const s = STATUTS[a.statut];
            const v = VERDICTS[a.verdict];
            return (
              <div key={a.id} className="bg-white rounded-3xl border border-[#D8DEE4] shadow-sm hover:shadow-lg transition overflow-hidden flex flex-col">
                <div className="relative h-40 bg-[#0B1F3A]">
                  {a.type === 'photo'
                    ? <img src={a.fichier} alt="" className="w-full h-full object-cover" />
                    : <video src={a.fichier} preload="metadata" muted className="w-full h-full object-cover" />}
                  {v && (
                    <span className={`absolute top-3 right-3 text-[11px] font-bold px-2.5 py-1 rounded-full ${v.cls}`}>
                      {v.label}
                    </span>
                  )}
                </div>
                <div className="p-5 flex-1 flex flex-col gap-3">
                  <div>
                    <p className="font-bold text-[#0B1F3A] truncate" title={a.nom_original}>{a.nom_original}</p>
                    <p className="text-xs text-[#4A5568] mt-0.5">{formaterDate(a.date_upload)} · {formaterTaille(a.taille)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span>
                    {a.statut === 'termine' && (
                      <span className="text-xs font-bold text-[#0B1F3A]">Score {Math.round(a.score)}/100</span>
                    )}
                  </div>
                  {a.statut === 'erreur' && <p className="text-xs text-[#E63946]">{a.message_erreur}</p>}
                  <div className="flex gap-2 pt-3 mt-auto border-t border-[#E7EBEF]">
                    {a.statut === 'termine' && (
                      <button type="button" onClick={() => ouvrir(a.id)}
                        className="flex-1 py-2 rounded-xl bg-[#00838F] hover:bg-[#006B75] text-white text-xs font-bold cursor-pointer transition">
                        Résultats
                      </button>
                    )}
                    {['termine', 'erreur'].includes(a.statut) && (
                      <button type="button" onClick={() => relancer(a.id)}
                        className="flex-1 py-2 rounded-xl border border-[#D8DEE4] text-[#0B1F3A] hover:bg-[#F4F6F8] text-xs font-bold cursor-pointer transition">
                        Réanalyser
                      </button>
                    )}
                    <button type="button" onClick={() => setASupprimer(a.id)}
                      className="px-3 py-2 rounded-xl border border-[#D8DEE4] text-[#E63946] hover:bg-red-50 text-xs font-bold cursor-pointer transition">
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {aSupprimer && (
        <div className="fixed inset-0 bg-[#0B1F3A]/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-[#D8DEE4] p-8 max-w-sm w-full shadow-2xl text-center">
            <h3 className="text-lg font-bold text-[#0B1F3A] mb-1.5">Supprimer cette analyse ?</h3>
            <p className="text-xs text-[#4A5568] mb-6">Le fichier et son résultat seront définitivement supprimés.</p>
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