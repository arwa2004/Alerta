import io

import cv2
import numpy as np
from PIL import Image, ImageChops

TAILLE_MAX = 1600


def analyser_ela(chemin, qualite=90):
    img = Image.open(chemin)
    if (img.format or "").upper() not in ("JPEG", "MPO"):
        return {"score": None, "carte": None,
                "indices": ["ELA applicable uniquement aux JPEG (ignorée pour ce format)"]}

    original = img.convert("RGB")
    original.thumbnail((TAILLE_MAX, TAILLE_MAX))

    tampon = io.BytesIO()
    original.save(tampon, "JPEG", quality=qualite)
    tampon.seek(0)
    recompresse = Image.open(tampon).convert("RGB")

    diff = ImageChops.difference(original, recompresse)
    erreur = np.asarray(diff, dtype="float32").mean(axis=2)
    maxi = max(float(erreur.max()), 1.0)

    # Carte de chaleur : plus c'est chaud, plus la zone réagit à la recompression
    gris = np.clip(erreur * (255.0 / maxi), 0, 255).astype("uint8")
    chaleur = cv2.cvtColor(cv2.applyColorMap(gris, cv2.COLORMAP_JET), cv2.COLOR_BGR2RGB)
    carte = Image.fromarray(chaleur)

    # Score : une image homogène a une erreur uniforme ; une zone retouchée ressort en « bloc aberrant »
    h, w = erreur.shape
    h16, w16 = h // 16 * 16, w // 16 * 16
    blocs = erreur[:h16, :w16].reshape(h16 // 16, 16, w16 // 16, 16).mean(axis=(1, 3))
    moyenne, ecart = float(blocs.mean()), float(blocs.std())
    if moyenne < 1e-6:
        return {"score": 0.0, "carte": carte, "indices": ["Erreur de recompression nulle"]}

    variation = ecart / moyenne
    aberrants = float((blocs > moyenne + 3 * ecart).mean())
    score = min(100.0, variation * 40 + aberrants * 500)

    indices = []
    if score >= 50:
        indices.append("Niveaux de compression très hétérogènes : des zones ont pu être collées ou retouchées")
    elif score >= 30:
        indices.append("Légère hétérogénéité de compression")
    else:
        indices.append("Niveau de compression homogène sur toute l'image")
    return {"score": round(score, 1), "carte": carte, "indices": indices}