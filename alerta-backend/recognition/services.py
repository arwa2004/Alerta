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


def identify_video_faces(zone: Zone, video_path: str, sample_fps: float = 1.0):
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

    # Résolution maximale pour l'analyse — réduit le temps de locate_faces sur les vidéos HD
    MAX_ANALYSIS_WIDTH = 640

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % step == 0:
            time_sec = round(frame_idx / video_fps, 1)
            time_str = f"{int(time_sec // 60):02d}:{int(time_sec % 60):02d}"

            # Réduire la résolution pour accélérer la détection
            h_orig, w_orig = frame.shape[:2]
            if w_orig > MAX_ANALYSIS_WIDTH:
                scale = MAX_ANALYSIS_WIDTH / w_orig
                small_frame = cv2.resize(frame, (MAX_ANALYSIS_WIDTH, int(h_orig * scale)))
            else:
                scale = 1.0
                small_frame = frame

            rgb_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
            locations_small = engine.locate_faces(rgb_frame)

            # Remettre les coordonnées à l'échelle originale pour le crop de vignette
            if scale != 1.0:
                locations = [(int(t/scale), int(r/scale), int(b/scale), int(l/scale))
                             for t, r, b, l in locations_small]
            else:
                locations = locations_small

            frame_faces = []
            h, w = frame.shape[:2]

            for loc_small, loc_orig in zip(locations_small, locations):
                # Encodage sur la petite frame (cohérent avec les coordonnées loc_small)
                enc = engine.encode_face(rgb_frame, loc_small)
                match = identify_encoding(zone, enc)
                # Coordonnées originales (HD) pour la box et les crops de vignettes
                top, right, bottom, left = loc_orig

                # Créer une vignette base64 du visage détecté avec une marge (sur frame HD originale)
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

                        # Trouver le groupe le plus proche (vectorisé pour plus de rapidité)
                        matched_cluster = None
                        min_dist = float('inf')
                        if unknown_clusters:
                            # Comparer avec le centroïde moyen de chaque cluster
                            for c in unknown_clusters:
                                centroid = c.get('centroid', c['encodings'][0])
                                d = float(np.linalg.norm(enc_arr - centroid))
                                if d < min_dist:
                                    min_dist = d
                                    matched_cluster = c

                        if matched_cluster is not None and min_dist < DEDUP_THRESHOLD:
                            # Même personne inconnue qui continue d'apparaître
                            matched_cluster['encodings'].append(enc_arr)
                            if len(matched_cluster['encodings']) > 8:
                                matched_cluster['encodings'] = matched_cluster['encodings'][-8:]
                            # Mise à jour du centroïde
                            matched_cluster['centroid'] = np.mean(matched_cluster['encodings'], axis=0)
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
                                'centroid': enc_arr.copy(),
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
            'encoding': [float(x) for x in np.mean(c['encodings'], axis=0)] if c.get('encodings') else None,
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


def extract_snapshot_encoding(snapshot: dict):
    """Extrait ou calcule l'encodage 128D d'un instantané de visage."""
    if not snapshot:
        return None
    if 'encoding' in snapshot and snapshot['encoding']:
        return np.asarray(snapshot['encoding'], dtype=float)
    if 'thumbnail' in snapshot and snapshot['thumbnail']:
        import base64
        try:
            raw = snapshot['thumbnail']
            if ',' in raw:
                raw = raw.split(',', 1)[1]
            img_bytes = base64.b64decode(raw)
            arr = quality.load_rgb_array(img_bytes)
            locs = engine.locate_faces(arr)
            if locs:
                return engine.encode_face(arr, locs[0])
        except Exception:
            return None
    return None


def search_unknown_across_videos(user, video_id: int = None, unknown_index: int = None,
                                 thumbnail: str = None, threshold: float = 0.50):
    """Recherche les apparitions d'un individu inconnu dans toutes les vidéos de toutes les zones."""
    from .models import Face, KnownPerson, SurveillanceVideo

    target_encoding = None
    target_meta = {}

    if video_id is not None and unknown_index is not None:
        target_video = SurveillanceVideo.objects.filter(id=video_id, uploaded_by=user).select_related('zone').first()
        if not target_video:
            raise ValueError("Vidéo source introuvable.")
        snaps = target_video.unknown_snapshots or []
        if unknown_index < 0 or unknown_index >= len(snaps):
            raise ValueError("Indice d'inconnu introuvable dans cette vidéo.")
        target_snap = snaps[unknown_index]
        target_encoding = extract_snapshot_encoding(target_snap)
        target_meta = {
            'video_id': target_video.id,
            'zone_id': target_video.zone_id,
            'zone_name': target_video.zone.name,
            'unknown_index': unknown_index,
            'thumbnail': target_snap.get('thumbnail'),
            'timestamp': target_snap.get('timestamp'),
            'first_seen': target_snap.get('first_seen'),
            'last_seen': target_snap.get('last_seen'),
            'created_at': target_video.created_at.isoformat(),
        }
    elif thumbnail:
        import base64
        try:
            raw = thumbnail.split(',', 1)[1] if ',' in thumbnail else thumbnail
            img_bytes = base64.b64decode(raw)
            arr = quality.load_rgb_array(img_bytes)
            locs = engine.locate_faces(arr)
            if not locs:
                raise ValueError("Aucun visage détecté sur l'image.")
            target_encoding = engine.encode_face(arr, locs[0])
            target_meta = {
                'video_id': None,
                'thumbnail': thumbnail,
            }
        except Exception as e:
            raise ValueError(f"Image invalide : {e}")
    else:
        raise ValueError("Spécifiez un identifiant de vidéo et un indice de visage, ou une image.")

    if target_encoding is None:
        raise ValueError("Impossible d'extraire la signature biométrique de ce visage.")

    # 1. Parcourir toutes les vidéos de l'utilisateur sur l'ensemble de ses zones
    all_videos = (SurveillanceVideo.objects.filter(uploaded_by=user)
                  .select_related('zone')
                  .order_by('-created_at'))

    matches = []

    for vid in all_videos:
        vid_snaps = vid.unknown_snapshots or []
        for idx, other_snap in enumerate(vid_snaps):
            # Ne pas comparer le visage à lui-même dans la même vidéo
            if target_meta.get('video_id') == vid.id and idx == unknown_index:
                continue

            other_encoding = extract_snapshot_encoding(other_snap)
            if other_encoding is None:
                continue

            dist = float(np.linalg.norm(target_encoding - other_encoding))
            if dist <= threshold:
                confidence = distance_to_confidence(dist, threshold)
                sim_pct = round(max(0.0, min(100.0, (1.0 - (dist / threshold)) * 100)), 1)
                matches.append({
                    'video_id': vid.id,
                    'zone_id': vid.zone_id,
                    'zone_name': vid.zone.name,
                    'video_url': vid.video_file.url if vid.video_file else None,
                    'original_filename': vid.original_filename,
                    'created_at': vid.created_at.isoformat(),
                    'unknown_index': idx,
                    'distance': round(dist, 4),
                    'confidence': confidence,
                    'similarity_percent': sim_pct,
                    'snapshot': other_snap,
                })

    # Trier par plus grande similarité (distance la plus faible)
    matches.sort(key=lambda m: m['distance'])

    # 2. Vérification de correspondance avec une personne connue enregistrée
    known_person_match = None
    all_known_faces = Face.objects.filter(person__owner=user, person__consent=True).select_related('person')
    best_known_dist = float('inf')
    best_known_person = None

    for kf in all_known_faces:
        kd = float(np.linalg.norm(target_encoding - np.asarray(kf.encoding, dtype=float)))
        if kd < best_known_dist:
            best_known_dist = kd
            best_known_person = kf.person

    if best_known_person and best_known_dist <= threshold:
        known_person_match = {
            'person_id': best_known_person.id,
            'full_name': best_known_person.full_name,
            'status': best_known_person.status,
            'distance': round(best_known_dist, 4),
            'confidence': distance_to_confidence(best_known_dist, threshold),
        }

    return {
        'target': target_meta,
        'threshold_used': threshold,
        'total_videos_analyzed': all_videos.count(),
        'matches_count': len(matches),
        'matches': matches,
        'known_person_match': known_person_match,
    }
