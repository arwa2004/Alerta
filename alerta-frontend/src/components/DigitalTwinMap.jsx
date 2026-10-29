import React, { useState, useEffect, useRef, useCallback } from 'react';

// Palette de couleurs vives pour différencier les caméras
const CAMERA_COLORS = [
  '#00C2CB', // Cyan
  '#E63946', // Rouge
  '#2BB673', // Vert
  '#F4A261', // Orange
  '#9B5DE5', // Violet
  '#F15BB5', // Rose
  '#3A86FF', // Bleu
  '#FFBE0B', // Jaune
];

export default function DigitalTwinMap({ analysisResult }) {
  // Récupération des données de ton analyse existante
  const { cleaned_image_b64, image_width, image_height, rooms } = analysisResult;

  const [cameras, setCameras] = useState([
    // Exemple de caméra initiale au centre
    { id: 1, x: image_width / 2, y: image_height / 2, angle: 0, fov: 90, range: 300 }
  ]);
  const [simulatedCameras, setSimulatedCameras] = useState([]);
  const [selectedCam, setSelectedCam] = useState(null);
  const [loading, setLoading] = useState(false);

  // Debounce pour éviter de spammer l'API quand on glisse un curseur
  const timeoutRef = useRef(null);

  const requestSimulation = useCallback(async (currentCameras) => {
    setLoading(true);
    try {
      const response = await fetch('/api/planner/digital-twin/simulate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cleaned_image_b64: cleaned_image_b64,
          image_width: image_width,
          cameras: currentCameras
        })
      });
      const data = await response.json();
      setSimulatedCameras(data.simulated_cameras);
    } catch (e) {
      console.error("Erreur de simulation", e);
    } finally {
      setLoading(false);
    }
  }, [cleaned_image_b64, image_width]);

  // Relancer la simulation quand les caméras changent (avec un léger délai)
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      requestSimulation(cameras);
    }, 300);
    return () => clearTimeout(timeoutRef.current);
  }, [cameras, requestSimulation]);

  // Ajouter une caméra en cliquant sur le plan
  const handleSvgClick = (e) => {
    if (e.target.closest('.camera-node')) return;

    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

    const newCam = {
      id: Date.now(),
      x: Math.round(svgP.x),
      y: Math.round(svgP.y),
      angle: 0,
      fov: 90,
      range: 300
    };
    setCameras([...cameras, newCam]);
    setSelectedCam(newCam.id);
  };

  // Mettre à jour une propriété de la caméra
  const updateCamera = (id, key, value) => {
    setCameras(cams => cams.map(c => c.id === id ? { ...c, [key]: value } : c));
  };

  // Supprimer une caméra
  const removeCamera = (id, e) => {
    e.stopPropagation();
    setCameras(cams => cams.filter(c => c.id !== id));
    if (selectedCam === id) setSelectedCam(null);
  };

  // Helper pour récupérer la couleur d'une caméra selon son index
  const getCamColor = (id) => {
    const index = cameras.findIndex(c => c.id === id);
    return CAMERA_COLORS[index % CAMERA_COLORS.length];
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 w-full h-[700px] bg-gray-50 p-4 rounded-xl">

      {/* ZONE DU PLAN (SVG interactif) */}
      <div className="relative flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {loading && (
          <div className="absolute top-4 right-4 z-10 bg-white/80 px-3 py-1 text-xs font-bold rounded shadow">
            Calcul de la vision...
          </div>
        )}

        <svg
          className="w-full h-full cursor-crosshair"
          viewBox={`0 0 ${image_width} ${image_height}`}
          onClick={handleSvgClick}
        >
          {/* 1. Le plan de fond */}
          <image href={cleaned_image_b64} width={image_width} height={image_height} />

          {/* 2. Les zones non couvertes (Rouge léger pour repérer les angles morts) */}
          {rooms?.map(room => (
            <polygon
              key={`room-${room.id}`}
              points={room.polygon.map(p => p.join(',')).join(' ')}
              fill="rgba(230, 57, 70, 0.15)"
              stroke="rgba(230, 57, 70, 0.3)"
              strokeWidth="1"
            />
          ))}

          {/* 3. Les cônes de vision colorés (calculés par le backend) */}
          {simulatedCameras.map(sim => {
            const color = getCamColor(sim.id);
            return (
              <polygon
                key={`sim-${sim.id}`}
                points={sim.fov_polygon.map(p => p.join(',')).join(' ')}
                fill={color}
                fillOpacity="0.35"
                stroke={color}
                strokeWidth="2"
                strokeOpacity="0.8"
                style={{ mixBlendMode: 'multiply' }} // Rend les superpositions plus visibles
              />
            );
          })}

          {/* 4. Les icônes des caméras */}
          {cameras.map(cam => {
            const color = getCamColor(cam.id);
            return (
              <g
                key={cam.id}
                transform={`translate(${cam.x}, ${cam.y})`}
                className="camera-node cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setSelectedCam(cam.id); }}
              >
                {/* Ligne d'orientation */}
                <line x1="0" y1="0" x2={Math.cos(cam.angle * Math.PI / 180) * 30} y2={Math.sin(cam.angle * Math.PI / 180) * 30} stroke={color} strokeWidth="3" />
                {/* Point de la caméra */}
                <circle r="10" fill={color} stroke={selectedCam === cam.id ? "#0B1F3A" : "#FFFFFF"} strokeWidth="3" />
              </g>
            );
          })}
        </svg>

        {/* LÉGENDE DES COULEURS */}
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur p-3 rounded-xl shadow border border-gray-200">
          <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Légende</h4>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded bg-[#E63946]/20 border border-[#E63946]/50"></span>
              <span className="text-gray-600 font-medium">Zone aveugle</span>
            </div>
            {cameras.map(cam => (
              <div key={cam.id} className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: getCamColor(cam.id) }}></span>
                <span className="text-gray-600 font-medium">Caméra #{cam.id.toString().slice(-4)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PANNEAU DE CONTRÔLE */}
      <div className="w-full lg:w-80 bg-white border border-gray-200 rounded-xl p-5 overflow-y-auto shadow-sm">
        <h3 className="font-bold text-[#0B1F3A] mb-4 text-lg">Contrôle des caméras</h3>
        <p className="text-xs text-gray-500 mb-6">
          Cliquez sur le plan pour ajouter une caméra. Chaque caméra a une couleur unique.
        </p>

        <div className="space-y-6">
          {cameras.map(cam => {
            const color = getCamColor(cam.id);
            return (
              <div
                key={cam.id}
                className={`p-3 border rounded-xl transition ${selectedCam === cam.id ? 'border-gray-400 bg-gray-50 shadow-sm' : 'border-gray-100 bg-white'}`}
                onClick={() => setSelectedCam(cam.id)}
              >
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-bold flex items-center gap-2" style={{ color }}>
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></span>
                    Caméra #{cam.id.toString().slice(-4)}
                  </span>
                  <button onClick={(e) => removeCamera(cam.id, e)} className="text-xs text-red-500 hover:text-red-700 font-bold px-2 py-1 bg-red-50 rounded">
                    Supprimer
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-[11px] font-semibold text-gray-600 mb-1">
                      <span>Angle</span> <span>{cam.angle}°</span>
                    </div>
                    <input type="range" min="0" max="360" value={cam.angle}
                      onChange={(e) => updateCamera(cam.id, 'angle', parseInt(e.target.value))}
                      className="w-full" style={{ accentColor: color }} />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-semibold text-gray-600 mb-1">
                      <span>Champ de vision (FOV)</span> <span>{cam.fov}°</span>
                    </div>
                    <input type="range" min="30" max="180" value={cam.fov}
                      onChange={(e) => updateCamera(cam.id, 'fov', parseInt(e.target.value))}
                      className="w-full" style={{ accentColor: color }} />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-semibold text-gray-600 mb-1">
                      <span>Portée (Range)</span> <span>{cam.range}px</span>
                    </div>
                    <input type="range" min="50" max="800" value={cam.range}
                      onChange={(e) => updateCamera(cam.id, 'range', parseInt(e.target.value))}
                      className="w-full" style={{ accentColor: color }} />
                  </div>
                </div>
              </div>
            );
          })}

          {cameras.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-10">
              Aucune caméra sur le plan.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}