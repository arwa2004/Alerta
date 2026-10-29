import io
import threading

from django.core.files.base import ContentFile
from django.db import close_old_connections, transaction
from django.utils import timezone

from ..models import AnalyseAuthenticite as A
from .analyse import analyser_media


def _executer(analyse_id):
    close_old_connections()
    try:
        analyse = A.objects.get(pk=analyse_id)
        analyse.statut = A.Statut.EN_COURS
        analyse.save(update_fields=["statut"])
        try:
            r = analyser_media(analyse)
            analyse.score, analyse.verdict, analyse.details = r["score"], r["verdict"], r["details"]
            if r["carte"] is not None:
                tampon = io.BytesIO()
                r["carte"].save(tampon, "JPEG", quality=85)
                analyse.carte_ela.save(f"ela_{analyse.id}.jpg", ContentFile(tampon.getvalue()), save=False)
            analyse.statut = A.Statut.TERMINE
            analyse.date_fin = timezone.now()
        except Exception as e:
            analyse.statut = A.Statut.ERREUR
            analyse.message_erreur = str(e)[:500]
        analyse.save()
    finally:
        close_old_connections()


def lancer_traitement(analyse_id):
    """Lance l'analyse après validation de la transaction (même principe que le module 2)."""
    transaction.on_commit(lambda: threading.Thread(
        target=_executer, args=(analyse_id,), daemon=True).start())