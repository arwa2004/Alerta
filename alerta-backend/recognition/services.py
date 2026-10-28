"""Service de comparaison appelé par les modules 2 (médias) et 3 (événements).

    identify_face(zone, image_bytes=...)  ou  identify_face(zone, encoding=...)
    identify_all_faces(zone, image_bytes) pour une image contenant plusieurs visages
"""
import math
from dataclasses import dataclass
from typing import Optional

import numpy as np
from django.core.cache import cache

from . import engine, quality
from .models import Face, KnownPerson, Zone


class ZoneInactive(Exception):
    pass


@dataclass
class MatchResult:
    person: Optional[KnownPerson]
    distance: Optional[float]
    confidence: float          # 0..100
    is_known: bool

    @property
    def status(self):
        return self.person.status if self.person else None

    @property
    def should_alert(self):
        """Alerte si le visage est inconnu ou si la personne est sur liste noire."""
        return (not self.is_known) or self.status == KnownPerson.Status.WATCHED


def distance_to_confidence(distance: float, threshold: float) -> float:
    """Conversion distance -> pourcentage (formule de la doc face_recognition)."""
    rng = 1.0 - threshold
    linear = (1.0 - distance) / (rng * 2.0)
    if distance > threshold:
        value = linear * 100
    else:
        value = (linear + ((1.0 - linear) * math.pow((linear - 0.5) * 2, 0.2))) * 100
    return round(max(0.0, min(100.0, value)), 1)


# ── Cache des encodages d'une zone ─────────────────────────────────────────────
# Une version par propriétaire : toute modification (visage, personne, zones)
# l'incrémente, ce qui invalide d'un coup les galeries en cache.

def _version_key(owner_id):
    return f"recognition:version:{owner_id}"


def _version(owner_id):
    v = cache.get(_version_key(owner_id))
    if v is None:
        v = 1
        cache.set(_version_key(owner_id), v, None)
    return v


def invalidate_owner(owner_id):
    cache.set(_version_key(owner_id), _version(owner_id) + 1, None)


def load_gallery(zone: Zone):
    key = f"recognition:gallery:{zone.owner_id}:{zone.pk}:{_version(zone.owner_id)}"
    gallery = cache.get(key)
    if gallery is None:
        rows = list(
            Face.objects.filter(person__zones=zone, person__consent=True)
            .values_list('person_id', 'encoding')
        )
        if rows:
            gallery = {
                'person_ids': np.array([r[0] for r in rows]),
                'matrix': np.array([r[1] for r in rows], dtype=float),
            }
        else:
            gallery = {'person_ids': np.array([], dtype=int), 'matrix': np.empty((0, 128))}
        cache.set(key, gallery, 3600)
    return gallery


# ── Comparaison ────────────────────────────────────────────────────────────────

def identify_encoding(zone: Zone, encoding) -> MatchResult:
    if not zone.is_active:
        raise ZoneInactive("Cette zone est désactivée.")

    gallery = load_gallery(zone)
    unknown = MatchResult(person=None, distance=None, confidence=0.0, is_known=False)
    if len(gallery['person_ids']) == 0:
        return unknown

    persons = KnownPerson.objects.in_bulk(set(int(i) for i in gallery['person_ids']))
    valid = np.array([
        pid in persons and persons[pid].is_valid_now() for pid in (int(i) for i in gallery['person_ids'])
    ])
    if not valid.any():
        return unknown

    distances = np.linalg.norm(gallery['matrix'] - np.asarray(encoding, dtype=float), axis=1)
    distances = np.where(valid, distances, np.inf)
    best = int(distances.argmin())            # le MEILLEUR match, pas le premier
    best_distance = float(distances[best])
    person = persons[int(gallery['person_ids'][best])]
    return MatchResult(
        person=person if best_distance <= zone.threshold else None,
        distance=round(best_distance, 4),
        confidence=distance_to_confidence(best_distance, zone.threshold),
        is_known=best_distance <= zone.threshold,
    )


def identify_face(zone: Zone, image_bytes: bytes = None, encoding=None) -> MatchResult:
    """Un visage contre ceux de la zone. Fournir `encoding` OU `image_bytes`."""
    if encoding is None:
        if image_bytes is None:
            raise ValueError("Fournir image_bytes ou encoding.")
        arr = quality.load_rgb_array(image_bytes)
        locations = engine.locate_faces(arr)
        if not locations:
            raise quality.PhotoRejected("aucun visage détecté.")
        encoding = engine.encode_face(arr, locations[0])
    return identify_encoding(zone, encoding)


def identify_all_faces(zone: Zone, image_bytes: bytes):
    """Tous les visages d'une image : liste de (location, MatchResult)."""
    arr = quality.load_rgb_array(image_bytes)
    return [
        (loc, identify_encoding(zone, engine.encode_face(arr, loc)))
        for loc in engine.locate_faces(arr)
    ]


def identify_video_faces(zone: Zone, video_path: str, sample_fps: float = 2.0):
    """Analyse une vidéo frame par frame, détecte les visages, identifie les personnes
    connues selon les règles de la zone et regroupe intelligemment les personnes inconnues.
    Chaque personne inconnue unique n'apparaît qu'une seule fois avec sa meilleure vignette.
    """
    import base64
    import cv2
    import numpy as np

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Impossible d'ouvrir le fichier vidéo.")

    video_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    duration = (total_frames / video_fps) if total_frames > 0 else 0

    step = max(1, int(video_fps / sample_fps))
    frame_idx = 0

    timeline = []
    known_persons = set()
    known_clusters = {}               # Meilleures vignettes des personnes connues détectées
    unknown_clusters = []             # Groupes de personnes inconnues uniques
    DEDUP_THRESHOLD = 0.50            # Même individu si distance < 0.50
    MAX_UNKNOWN_SNAPSHOTS = 20
    alert_triggered = False

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % step == 0:
            time_sec = round(frame_idx / video_fps, 1)
            time_str = f"{int(time_sec // 60):02d}:{int(time_sec % 60):02d}"

            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            locations = engine.locate_faces(rgb_frame)

            frame_faces = []
            h, w = frame.shape[:2]

            for loc in locations:
                enc = engine.encode_face(rgb_frame, loc)
                match = identify_encoding(zone, enc)
                top, right, bottom, left = loc

                # Créer une vignette base64 du visage détecté avec une marge
                pad_y = int((bottom - top) * 0.25)
                pad_x = int((right - left) * 0.25)
                crop = frame[max(0, top-pad_y):min(h, bottom+pad_y), max(0, left-pad_x):min(w, right+pad_x)]
                thumb_b64 = None
                if crop.size > 0:
                    _, buf = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    thumb_b64 = f"data:image/jpeg;base64,{base64.b64encode(buf).decode('ascii')}"

                detection = {
                    'box': {'top': top, 'right': right, 'bottom': bottom, 'left': left},
                    'is_known': match.is_known,
                    'should_alert': match.should_alert,
                    'confidence': match.confidence,
                    'distance': match.distance,
                    'person': ({
                        'id': match.person.id,
                        'full_name': match.person.full_name,
                        'status': match.person.status,
                    } if match.person else None),
                    'thumbnail': thumb_b64,
                }
                frame_faces.append(detection)

                if match.should_alert or not match.is_known:
                    alert_triggered = True

                    # Regroupement robuste par individu inconnu
                    if thumb_b64 and enc is not None:
                        enc_arr = np.asarray(enc, dtype=float)
                        area = (bottom - top) * (right - left)

                        # Trouver le groupe le plus proche
                        matched_cluster = None
                        min_dist = float('inf')
                        for c in unknown_clusters:
                            d = min(float(np.linalg.norm(enc_arr - e)) for e in c['encodings'])
                            if d < min_dist:
                                min_dist = d
                                matched_cluster = c

                        if matched_cluster is not None and min_dist < DEDUP_THRESHOLD:
                            # Même personne inconnue qui continue d'apparaître
                            matched_cluster['encodings'].append(enc_arr)
                            if len(matched_cluster['encodings']) > 8:
                                matched_cluster['encodings'] = matched_cluster['encodings'][-8:]
                            matched_cluster['count'] += 1
                            matched_cluster['last_seen'] = time_str
                            # Conserver la meilleure capture (la plus grande et nette)
                            if area > matched_cluster['best_area']:
                                matched_cluster['best_area'] = area
                                matched_cluster['thumbnail'] = thumb_b64
                                matched_cluster['timestamp'] = time_str
                                matched_cluster['confidence'] = match.confidence
                        elif len(unknown_clusters) < MAX_UNKNOWN_SNAPSHOTS:
                            # Nouvelle personne inconnue distincte
                            unknown_clusters.append({
                                'encodings': [enc_arr],
                                'best_area': area,
                                'thumbnail': thumb_b64,
                                'timestamp': time_str,
                                'first_seen': time_str,
                                'last_seen': time_str,
                                'count': 1,
                                'confidence': match.confidence,
                            })
                elif match.person:
                    known_persons.add(match.person.full_name)
                    # Enregistrer la meilleure vignette du visage de la personne connue
                    if thumb_b64:
                        area = (bottom - top) * (right - left)
                        pid = match.person.id
                        if pid not in known_clusters or area > known_clusters[pid]['best_area']:
                            known_clusters[pid] = {
                                'id': pid,
                                'full_name': match.person.full_name,
                                'status': match.person.status,
                                'best_area': area,
                                'thumbnail': thumb_b64,
                                'timestamp': time_str,
                                'confidence': match.confidence,
                            }

            if frame_faces:
                timeline.append({
                    'timestamp': time_str,
                    'time_seconds': time_sec,
                    'faces': frame_faces,
                })

        frame_idx += 1

    cap.release()

    unknown_snapshots = [
        {
            'timestamp': c['timestamp'],
            'thumbnail': c['thumbnail'],
            'confidence': c['confidence'],
            'first_seen': c['first_seen'],
            'last_seen': c['last_seen'],
            'count': c['count'],
        }
        for c in unknown_clusters
    ]

    known_snapshots = [
        {
            'id': c['id'],
            'full_name': c['full_name'],
            'status': c['status'],
            'thumbnail': c['thumbnail'],
            'timestamp': c['timestamp'],
            'confidence': c['confidence'],
        }
        for c in known_clusters.values()
    ]

    return {
        'type': 'video',
        'zone': zone.id,
        'duration_seconds': round(duration, 1),
        'total_detections': sum(len(t['faces']) for t in timeline),
        'alert_triggered': alert_triggered,
        'unknown_detected': alert_triggered,
        'unknown_snapshots': unknown_snapshots,
        'known_snapshots': known_snapshots,
        'known_persons': list(known_persons),
        'timeline': timeline,
    }
