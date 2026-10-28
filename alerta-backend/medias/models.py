from django.db import models

# Create your models here.
import os
import uuid

from django.conf import settings
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver


def chemin_media(instance, nom_fichier):
    """Nom aléatoire, rangé par propriétaire et par zone."""
    extension = os.path.splitext(nom_fichier)[1].lower()
    return f"medias/{instance.owner_id}/{instance.zone_id}/{uuid.uuid4().hex}{extension}"


class Media(models.Model):
    class Type(models.TextChoices):
        PHOTO = "photo", "Photo"
        VIDEO = "video", "Vidéo"

    class Statut(models.TextChoices):
        EN_ATTENTE = "en_attente", "En attente"
        EN_COURS = "en_cours", "En cours"
        TERMINE = "termine", "Terminé"
        ERREUR = "erreur", "Erreur"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="medias")
    zone = models.ForeignKey("recognition.Zone", on_delete=models.CASCADE, related_name="medias")
    fichier = models.FileField(upload_to=chemin_media)
    nom_original = models.CharField(max_length=255, blank=True)
    type = models.CharField(max_length=10, choices=Type.choices)
    statut = models.CharField(max_length=12, choices=Statut.choices, default=Statut.EN_ATTENTE)
    taille = models.PositiveBigIntegerField(default=0)
    date_upload = models.DateTimeField(auto_now_add=True)
    date_traitement = models.DateTimeField(null=True, blank=True)
    resultats = models.JSONField(default=dict, blank=True)
    message_erreur = models.TextField(blank=True)

    class Meta:
        ordering = ["-date_upload"]

    def __str__(self):
        return f"{self.type} #{self.pk} ({self.statut})"


@receiver(post_delete, sender=Media)
def supprimer_fichier_du_disque(sender, instance, **kwargs):
    """Supprime aussi le fichier (y compris quand une zone est supprimée en cascade)."""
    if instance.fichier:
        instance.fichier.delete(save=False)