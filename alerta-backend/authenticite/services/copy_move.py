from collections import Counter

import cv2
import numpy as np


def analyser_copy_move(chemin):
    img = cv2.imread(chemin, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return {"score": None, "indices": ["Image illisible pour le copier-coller"]}

    h, w = img.shape
    if max(h, w) > 1200:
        facteur = 1200 / max(h, w)
        img = cv2.resize(img, None, fx=facteur, fy=facteur)

    orb = cv2.ORB_create(nfeatures=3000)
    points, desc = orb.detectAndCompute(img, None)
    if desc is None or len(points) < 20:
        return {"score": 0.0, "indices": ["Pas assez de détails pour tester le clonage"]}

    # Chaque point est comparé aux autres points de LA MÊME image (le 1er résultat est lui-même)
    paires = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(desc, desc, k=3)
    vecteurs = []
    for p in paires:
        if len(p) < 3:
            continue
        _, m1, m2 = p
        if m1.distance < 0.6 * m2.distance:
            a, b = np.array(points[m1.queryIdx].pt), np.array(points[m1.trainIdx].pt)
            if np.linalg.norm(a - b) > 40:
                dx, dy = b - a
                if dx < 0 or (dx == 0 and dy < 0):   # (a→b) et (b→a) comptent pour un seul vecteur
                    dx, dy = -dx, -dy
                vecteurs.append((round(dx / 8), round(dy / 8)))

    if not vecteurs:
        return {"score": 0.0, "indices": ["Aucune région dupliquée détectée"]}

    # Une vraie zone clonée donne beaucoup de correspondances avec le MÊME décalage
    meilleur = Counter(vecteurs).most_common(1)[0][1]
    score = 0.0 if meilleur < 6 else min(100.0, (meilleur - 5) * 10.0)
    if score >= 40:
        indices = [f"{meilleur} points se répètent avec le même décalage : région probablement clonée"]
    else:
        indices = ["Aucune région dupliquée détectée"]
    return {"score": round(score, 1), "indices": indices}