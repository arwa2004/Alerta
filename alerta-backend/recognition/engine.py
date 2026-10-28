"""Fine couche autour de `face_recognition` (dlib).

L'import est paresseux : le reste du projet (et les tests, qui mockent ces
fonctions) fonctionne même si dlib n'est pas installé.
"""
import numpy as np


class FaceEngineUnavailable(RuntimeError):
    pass


def _fr():
    try:
        import face_recognition
    except ImportError as exc:  # pragma: no cover
        raise FaceEngineUnavailable(
            "Le moteur de reconnaissance (face_recognition / dlib) n'est pas installé."
        ) from exc
    return face_recognition


def locate_faces(rgb_array, upsample=2):
    """Liste de (top, right, bottom, left).

    upsample=2 permet de détecter des visages plus petits (personnes éloignées)
    au prix d'un temps de traitement légèrement supérieur.
    """
    return _fr().face_locations(rgb_array, number_of_times_to_upsample=upsample, model='hog')


def encode_face(rgb_array, location):
    """Encodage 128 valeurs du visage situé à `location`."""
    encodings = _fr().face_encodings(rgb_array, known_face_locations=[location])
    return np.asarray(encodings[0], dtype=float)
