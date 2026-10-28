"""Validation de la qualité des photos et calcul des encodages."""
import hashlib
import io
from dataclasses import dataclass

import numpy as np
from django.conf import settings
from PIL import Image, ImageOps

from . import engine

ALLOWED_FORMATS = {'JPEG', 'PNG', 'WEBP'}
MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_SIDE = 1280
MIN_IMAGE_SIDE = 100
MIN_FACE_SIDE = 50
MIN_SHARPNESS = getattr(settings, 'RECOGNITION_MIN_SHARPNESS', 2.0)
BRIGHTNESS_RANGE = (40, 220)


def same_person_max_distance():
    return getattr(settings, 'RECOGNITION_SAME_PERSON_MAX_DISTANCE', 0.6)


class PhotoRejected(Exception):
    """Une photo ne respecte pas les critères de qualité."""


class PhotoBatchRejected(Exception):
    def __init__(self, errors):
        self.errors = errors
        super().__init__('; '.join(errors))


@dataclass
class PhotoAnalysis:
    encoding: list
    quality_score: float
    sha256: str
    face_side: int
    sharpness: float
    brightness: float


def load_rgb_array(data: bytes) -> np.ndarray:
    try:
        img = Image.open(io.BytesIO(data))
        fmt = img.format
        img.verify()
        img = Image.open(io.BytesIO(data))
    except Exception:
        raise PhotoRejected("fichier illisible, ce n'est pas une image valide.")
    if fmt not in ALLOWED_FORMATS:
        raise PhotoRejected("format non pris en charge (JPEG, PNG ou WebP uniquement).")
    img = ImageOps.exif_transpose(img).convert('RGB')
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    return np.asarray(img)


def sharpness(gray: np.ndarray) -> float:
    """Variance du Laplacien : faible = image floue."""
    g = gray.astype(np.float64)
    lap = g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:] - 4 * g[1:-1, 1:-1]
    return float(lap.var())


def analyze_photo(upload) -> PhotoAnalysis:
    data = upload.read()
    upload.seek(0)
    if len(data) > MAX_FILE_BYTES:
        raise PhotoRejected("fichier trop lourd (5 Mo maximum).")

    arr = load_rgb_array(data)
    h, w = arr.shape[:2]
    if min(h, w) < MIN_IMAGE_SIDE:
        raise PhotoRejected(f"résolution trop faible (minimum {MIN_IMAGE_SIDE} px de côté).")

    locations = engine.locate_faces(arr)
    if len(locations) == 0:
        raise PhotoRejected("aucun visage détecté.")
    if len(locations) > 1:
        raise PhotoRejected("plusieurs visages détectés, un seul visage par photo.")

    top, right, bottom, left = (max(0, int(v)) for v in locations[0])
    face_side = min(bottom - top, right - left)
    if face_side < MIN_FACE_SIDE:
        raise PhotoRejected("visage trop petit, rapprochez-vous de l'appareil.")

    crop = Image.fromarray(arr[top:bottom, left:right]).resize((160, 160)).convert('L')
    gray = np.asarray(crop)
    brightness = float(gray.mean())
    if not (BRIGHTNESS_RANGE[0] <= brightness <= BRIGHTNESS_RANGE[1]):
        raise PhotoRejected("visage trop sombre ou surexposé.")
    sharp = sharpness(gray)
    if sharp < MIN_SHARPNESS:
        raise PhotoRejected("photo floue.")

    encoding = engine.encode_face(arr, (top, right, bottom, left))

    score = 100 * (
        0.40 * min(sharp / (MIN_SHARPNESS * 4), 1)
        + 0.35 * min(face_side / (MIN_FACE_SIDE * 3), 1)
        + 0.25 * (1 - abs(brightness - 128) / 128)
    )
    return PhotoAnalysis(
        encoding=[float(x) for x in encoding],
        quality_score=round(score, 1),
        sha256=hashlib.sha256(data).hexdigest(),
        face_side=face_side,
        sharpness=round(sharp, 1),
        brightness=round(brightness, 1),
    )


def analyze_batch(uploads, existing_encodings=(), existing_hashes=()):
    """Analyse un lot de photos d'une même personne.

    Rejette : photos de mauvaise qualité, doublons, et photos qui ne semblent pas
    montrer la même personne (distance entre encodages > seuil).
    """
    errors, analyses, seen = [], [], set(existing_hashes)
    for i, upload in enumerate(uploads, 1):
        try:
            analysis = analyze_photo(upload)
        except PhotoRejected as exc:
            errors.append(f"Photo {i} : {exc}")
            continue
        if analysis.sha256 in seen:
            errors.append(f"Photo {i} : doublon d'une photo déjà fournie.")
            continue
        seen.add(analysis.sha256)
        analyses.append((i, analysis))
    if errors:
        raise PhotoBatchRejected(errors)

    vectors = [np.asarray(e, dtype=float) for e in existing_encodings]
    offset = len(vectors)
    vectors += [np.asarray(a.encoding, dtype=float) for _, a in analyses]
    n = len(vectors)
    if n >= 2:
        mat = np.vstack(vectors)
        dist = np.linalg.norm(mat[:, None, :] - mat[None, :, :], axis=2)
        if dist.max() > same_person_max_distance():
            worst = int((dist.sum(axis=1) / (n - 1)).argmax())
            label = f"Photo {analyses[worst - offset][0]}" if worst >= offset else "Une photo déjà enregistrée"
            raise PhotoBatchRejected(
                [f"{label} : ne semble pas montrer la même personne que les autres photos."]
            )
    return [a for _, a in analyses]
