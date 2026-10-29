import os
import tempfile

import cv2
import numpy as np


def extraire_images(chemin, nombre):
    """Retourne (dossier_temporaire, [(seconde, chemin_image), ...])."""
    cap = cv2.VideoCapture(chemin)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    if total <= 0:
        cap.release()
        raise ValueError("Vidéo illisible ou vide")

    positions = np.linspace(0, total - 1, nombre, dtype=int) if total > nombre else range(total)
    dossier = tempfile.mkdtemp(prefix="auth_")
    images = []
    for i, pos in enumerate(positions):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(pos))
        ok, frame = cap.read()
        if not ok:
            continue
        chemin_img = os.path.join(dossier, f"{i:03d}.jpg")
        cv2.imwrite(chemin_img, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
        images.append((round(float(pos) / fps, 1), chemin_img))
    cap.release()
    if not images:
        raise ValueError("Aucune image n'a pu être extraite de la vidéo")
    return dossier, images