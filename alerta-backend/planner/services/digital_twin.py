import cv2
import numpy as np
import base64
# On importe tes fonctions existantes ! (Assure-toi que le nom du fichier est correct)
from .floorplan_analysis import _cam_cast_rays, _cam_sweep 

def simulate_custom_cameras(cleaned_image_b64, custom_cameras, image_width):
    """
    Prend les caméras personnalisées et génère leurs polygones de vision
    en utilisant le même raycasting que l'algorithme principal.
    """
    if not cleaned_image_b64 or not custom_cameras:
        return {"simulated_cameras": []}

    # 1. Décoder le masque des murs à partir de l'image nettoyée
    png = base64.b64decode(cleaned_image_b64.split(",", 1)[1])
    gray = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE)
    H, W = gray.shape
    walls = gray < 128
    s = W / float(image_width) # Ratio d'échelle

    results = []
    
    for cam in custom_cameras:
        # Coordonnées et paramètres de la caméra
        x, y = cam['x'] * s, cam['y'] * s
        fov = cam.get('fov', 90)
        angle = cam.get('angle', 0)
        max_r = int(cam.get('range', 300) * s) # Range maximum en pixels

        # 2. Calcul des rayons et génération du cône de vision
        first_hit_distances = _cam_cast_rays(walls, x, y, max_r)
        pts = _cam_sweep(first_hit_distances, angle, fov, x, y, step_deg=1.0)
        
        # 3. Retour aux coordonnées d'origine pour le frontend
        poly = [[int(px / s), int(py / s)] for px, py in pts]
        
        results.append({
            "id": cam['id'], 
            "fov_polygon": poly,
            "position": [int(x / s), int(y / s)],
            "angle": angle,
            "fov": fov,
            "range": int(max_r / s)
        })
        
    return {"simulated_cameras": results}