import logging
import threading

from django.db import close_old_connections, transaction
from django.utils import timezone

from recognition import services as reco

from ..models import Media
from .mouvement import detecter_mouvements

logger = logging.getLogger(__name__)

# Une seule analyse à la fois : évite de saturer le processeur
_verrou = threading.Semaphore(1)


def lancer_traitement(media_id):
    """Lance l'analyse dans un thread, une fois la transaction validée."""
    transaction.on_commit(
        lambda: threading.Thread(target=_executer, args=(media_id,), daemon=True).start()
    )


def _executer(media_id):
    with _verrou:
        _traiter(media_id)


def _box(loc):
    top, right, bottom, left = loc
    return {"top": top, "right": right, "bottom": bottom, "left": left}


def _analyser_photo(media):
    with media.fichier.open("rb") as f:
        octets = f.read()

    trouves = reco.identify_all_faces(media.zone, octets)
    visages = [{
        "box": _box(loc),
        "is_known": m.is_known,
        "should_alert": m.should_alert,
        "confidence": m.confidence,
        "distance": m.distance,
        "person": {"id": m.person.id, "full_name": m.person.full_name,
                   "status": m.person.status} if m.person else None,
    } for loc, m in trouves]

    alerte = any(v["should_alert"] for v in visages)
    return {
        "type": "photo",
        "zone": media.zone_id,
        "total_detections": len(visages),
        "alert_triggered": alerte,
        "unknown_detected": alerte,
        "known_persons": sorted({v["person"]["full_name"] for v in visages if v["person"]}),
        "faces": visages,
        "mouvement": {"detecte": False, "instants": []},
    }


def _analyser_video(media):
    resultat = reco.identify_video_faces(media.zone, media.fichier.path)
    # Une vignette par visage et par image rendrait le JSON énorme : on les retire
    # de la timeline (les vignettes utiles restent dans known_snapshots / unknown_snapshots).
    for instant in resultat["timeline"]:
        for visage in instant["faces"]:
            visage.pop("thumbnail", None)
    resultat["mouvement"] = detecter_mouvements(media.fichier.path)
    return resultat


def _traiter(media_id):
    close_old_connections()
    try:
        media = Media.objects.select_related("zone").get(pk=media_id)
    except Media.DoesNotExist:        # supprimé entre-temps
        return

    media.statut = Media.Statut.EN_COURS
    media.save(update_fields=["statut"])
    try:
        if media.type == Media.Type.PHOTO:
            media.resultats = _analyser_photo(media)
        else:
            media.resultats = _analyser_video(media)
        media.statut = Media.Statut.TERMINE
        media.message_erreur = ""
    except Exception as erreur:       # inclut ZoneInactive, PhotoRejected, FaceEngineUnavailable
        logger.exception("Échec du traitement du média %s", media_id)
        media.statut = Media.Statut.ERREUR
        media.message_erreur = str(erreur)

    media.date_traitement = timezone.now()
    media.save(update_fields=["resultats", "statut", "message_erreur", "date_traitement"])
    close_old_connections()