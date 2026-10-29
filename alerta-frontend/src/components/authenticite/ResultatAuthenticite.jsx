export const VERDICTS = {
  authentique: { label: 'Authentique probable', cls: 'bg-green-50 text-green-700', couleur: '#1D8A57' },
  suspect: { label: 'Suspect', cls: 'bg-orange-50 text-orange-600', couleur: '#E08A00' },
  retouche: { label: 'Probablement retouché', cls: 'bg-red-50 text-[#E63946]', couleur: '#E63946' },
};

const TECHNIQUES = {
  exif: 'Métadonnées (EXIF)',
  ela: 'Analyse ELA (recompression)',
  copy_move: 'Copier-coller interne',
  ia: 'Détecteur IA (image générée)',
};

function Jauge({ score, couleur }) {
  return (
    <div>
      <div className="flex items-end justify-between mb-1.5">
        <span className="text-4xl font-extrabold" style={{ color: couleur }}>{Math.round(score)}</span>
        <span className="text-xs text-[#4A5568] font-semibold">Score de suspicion / 100</span>
      </div>
      <div className="h-3 rounded-full bg-[#E7EBEF] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: couleur }} />
      </div>
      <div className="flex justify-between text-[10px] text-[#8FA3B8] mt-1">
        <span>0 · authentique</span><span>30</span><span>60</span><span>100 · retouché</span>
      </div>
    </div>
  );
}

function CourbeVideo({ images }) {
  if (!images || images.length < 2) return null;
  const n = images.length;
  const pts = images.map((im, i) => `${(i / (n - 1)) * 300},${85 - im.score * 0.8}`).join(' ');
  const pire = images.reduce((a, b) => (b.score > a.score ? b : a));
  return (
    <section>
      <h4 className="font-bold text-[#0B1F3A] mb-2">Score image par image</h4>
      <svg viewBox="0 0 300 90" className="w-full h-28 bg-[#F4F6F8] rounded-2xl">
        <line x1="0" y1={85 - 30 * 0.8} x2="300" y2={85 - 30 * 0.8} stroke="#E7EBEF" strokeDasharray="3 3" />
        <line x1="0" y1={85 - 60 * 0.8} x2="300" y2={85 - 60 * 0.8} stroke="#E7EBEF" strokeDasharray="3 3" />
        <polyline points={pts} fill="none" stroke="#00838F" strokeWidth="2" />
      </svg>
      <p className="text-xs text-[#4A5568] mt-1.5">
        Image la plus suspecte : à {pire.temps} s (score {Math.round(pire.score)}).
      </p>
    </section>
  );
}

export function ModaleAuthenticite({ analyse, onClose }) {
  const d = analyse.details || {};
  const techniques = d.techniques || {};
  const v = VERDICTS[analyse.verdict];

  return (
    <div className="fixed inset-0 bg-[#0B1F3A]/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-3xl border border-[#D8DEE4] shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 p-6 border-b border-[#E7EBEF]">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[#0B1F3A] truncate">{analyse.nom_original}</h3>
            {v && <span className={`inline-block mt-1 text-xs font-bold px-2.5 py-1 rounded-full ${v.cls}`}>{v.label}</span>}
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-[#4A5568] hover:text-[#0B1F3A] cursor-pointer">×</button>
        </div>

        <div className="p-6 space-y-6">
          {v && <Jauge score={analyse.score ?? 0} couleur={v.couleur} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <figure>
              <figcaption className="text-xs font-semibold text-[#4A5568] mb-1.5">Média analysé</figcaption>
              {analyse.type === 'photo'
                ? <img src={analyse.fichier} alt="" className="w-full h-52 object-cover rounded-2xl bg-[#0B1F3A]" />
                : <video src={analyse.fichier} controls className="w-full h-52 object-cover rounded-2xl bg-[#0B1F3A]" />}
            </figure>
            <figure>
              <figcaption className="text-xs font-semibold text-[#4A5568] mb-1.5">
                Carte ELA {analyse.type === 'video' ? '(image la plus suspecte)' : ''} : les zones chaudes réagissent différemment
              </figcaption>
              {analyse.carte_ela
                ? <img src={analyse.carte_ela} alt="Carte ELA" className="w-full h-52 object-cover rounded-2xl bg-[#F4F6F8]" />
                : <div className="w-full h-52 rounded-2xl bg-[#F4F6F8] flex items-center justify-center text-xs text-[#8FA3B8] text-center px-4">
                    Carte indisponible (format non JPEG)
                  </div>}
            </figure>
          </div>

          <section>
            <h4 className="font-bold text-[#0B1F3A] mb-3">Détail par technique</h4>
            <div className="space-y-3">
              {Object.entries(TECHNIQUES).map(([cle, nom]) => {
                const t = techniques[cle];
                if (!t) return null;
                const s = t.score;
                return (
                  <div key={cle} className="border border-[#E7EBEF] rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-sm text-[#0B1F3A]">{nom}</p>
                      <span className="text-xs font-bold text-[#4A5568]">
                        {s === null || s === undefined ? 'Non applicable' : `${Math.round(s)} / 100`}
                      </span>
                    </div>
                    {s !== null && s !== undefined && (
                      <div className="h-1.5 rounded-full bg-[#E7EBEF] mb-2 overflow-hidden">
                        <div className="h-full rounded-full bg-[#00838F]" style={{ width: `${s}%` }} />
                      </div>
                    )}
                    <ul className="text-xs text-[#4A5568] space-y-0.5 list-disc pl-4">
                      {(t.indices || []).map((i, k) => <li key={k}>{i}</li>)}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>

          <CourbeVideo images={d.images} />

          <p className="text-[11px] text-[#8FA3B8] leading-relaxed">
            Ce score est un indice de suspicion, pas une preuve. Une image recompressée ou envoyée par
            messagerie peut perdre ses métadonnées et fausser certaines analyses.
          </p>
        </div>
      </div>
    </div>
  );
}