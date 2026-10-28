import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function DigitalTwinMap({ analysisResult, onSimulate }) {
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
    if (e.target.closest('.camera-node')) return; // Ignore les clics sur une caméra existante

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

  // Mettre à jour une propriété de la caméra (angle, fov, range)
  const updateCamera = (id, key, value) => {
    setCameras(cams => cams.map(c => c.id === id ? { ...c, [key]: value } : c));
  };

  // Supprimer une caméra
  const removeCamera = (id, e) => {
    e.stopPropagation();
    setCameras(cams => cams.filter(c => c.id !== id));
    if (selectedCam === id) setSelectedCam(null);
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
          {/* 1. Le plan de fond (celui de ton OpenCV) */}
          <image href={cleaned_image_b64} width={image_width} height={image_height} />

          {/* 2. Les pièces en rouge transparent (zones aveugles par défaut) */}
          {rooms?.map(room => (
            <polygon
              key={`room-${room.id}`}
              points={room.polygon.map(p => p.join(',')).join(' ')}
              fill="rgba(230, 57, 70, 0.15)"
              stroke="rgba(230, 57, 70, 0.4)"
              strokeWidth="2"
            />
          ))}

          {/* 3. Les zones de vision vertes (calculées par le backend) */}
          {simulatedCameras.map(sim => (
            <polygon
              key={`sim-${sim.id}`}
              points={sim.fov_polygon.map(p => p.join(',')).join(' ')}
              fill="rgba(43, 182, 115, 0.4)"
              stroke="rgba(43, 182, 115, 0.8)"
              strokeWidth="1"
            />
          ))}

          {/* 4. Les caméras */}
          {cameras.map(cam => (
            <g 
              key={cam.id} 
              transform={`translate(${cam.x}, ${cam.y})`}
              className="camera-node cursor-pointer"
              onClick={(e) => { e.stopPropagation(); setSelectedCam(cam.id); }}
            >
              {/* Ligne d'orientation */}
              <line x1="0" y1="0" x2={Math.cos(cam.angle * Math.PI/180) * 30} y2={Math.sin(cam.angle * Math.PI/180) * 30} stroke="#0B1F3A" strokeWidth="2" />
              {/* Point de la caméra */}
              <circle r="10" fill="#00C2CB" stroke={selectedCam === cam.id ? "#E63946" : "#0B1F3A"} strokeWidth="3" />
            </g>
          ))}
        </svg>
      </div>

      {/* PANNEAU DE CONTRÔLE */}
      <div className="w-full lg:w-80 bg-white border border-gray-200 rounded-xl p-5 overflow-y-auto shadow-sm">
        <h3 className="font-bold text-[#0B1F3A] mb-4 text-lg">Contrôle des caméras</h3>
        <p className="text-xs text-gray-500 mb-6">
          Cliquez sur le plan pour ajouter une caméra. Sélectionnez-en une pour ajuster son angle et sa portée.
        </p>

        <div className="space-y-6">
          {cameras.map(cam => (
            <div 
              key={cam.id} 
              className={`p-3 border rounded-xl transition ${selectedCam === cam.id ? 'border-[#00C2CB] bg-[#E4F8F9]/30' : 'border-gray-100 bg-gray-50'}`}
              onClick={() => setSelectedCam(cam.id)}
            >
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-bold text-[#0B1F3A]">Caméra #{cam.id.toString().slice(-4)}</span>
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
                         className="w-full accent-[#00C2CB]" />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-gray-600 mb-1">
                    <span>Champ de vision (FOV)</span> <span>{cam.fov}°</span>
                  </div>
                  <input type="range" min="30" max="180" value={cam.fov} 
                         onChange={(e) => updateCamera(cam.id, 'fov', parseInt(e.target.value))}
                         className="w-full accent-[#00C2CB]" />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-gray-600 mb-1">
                    <span>Portée (Range)</span> <span>{cam.range}px</span>
                  </div>
                  <input type="range" min="50" max="800" value={cam.range} 
                         onChange={(e) => updateCamera(cam.id, 'range', parseInt(e.target.value))}
                         className="w-full accent-[#00C2CB]" />
                </div>
              </div>
            </div>
          ))}

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