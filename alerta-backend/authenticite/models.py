from django.conf import settings
from django.db import models


class AnalyseAuthenticite(models.Model):
    class Type(models.TextChoices):
        PHOTO = "photo", "Photo"
        VIDEO = "video", "Vidéo"

    class Statut(models.TextChoices):
        EN_ATTENTE = "en_attente", "En attente"
        EN_COURS = "en_cours", "En cours"
        TERMINE = "termine", "Terminé"
        ERREUR = "erreur", "Erreur"

    class Verdict(models.TextChoices):
        AUTHENTIQUE = "authentique", "Authentique probable"
        SUSPECT = "suspect", "Suspect"
        RETOUCHE = "retouche", "Probablement retouché"

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name="analyses_authenticite")
    fichier = models.FileField(upload_to="authenticite/%Y/%m/")
    nom_original = models.CharField(max_length=255)
    type = models.CharField(max_length=10, choices=Type.choices)
    taille = models.BigIntegerField(default=0)
    media_source = models.ForeignKey("medias.Media", null=True, blank=True,
                                     on_delete=models.SET_NULL, related_name="analyses_authenticite")
    statut = models.CharField(max_length=12, choices=Statut.choices, default=Statut.EN_ATTENTE)
    message_erreur = models.TextField(blank=True)

    score = models.FloatField(null=True, blank=True)            # 0 à 100
    verdict = models.CharField(max_length=12, choices=Verdict.choices, blank=True)
    details = models.JSONField(default=dict, blank=True)         # résultat de chaque technique
    carte_ela = models.ImageField(upload_to="authenticite/ela/", null=True, blank=True)

    date_upload = models.DateTimeField(auto_now_add=True)
    date_fin = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-date_upload"]

    def __str__(self):
        return f"{self.nom_original} ({self.statut})"