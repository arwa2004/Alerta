import os
import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


def face_upload_path(instance, filename):
    """Nom aléatoire (non devinable) rangé par propriétaire et par personne."""
    ext = os.path.splitext(filename)[1].lower() or '.jpg'
    return f"faces/{instance.person.owner_id}/{instance.person_id}/{uuid.uuid4().hex}{ext}"


class Zone(models.Model):
    """Zone surveillée (maison, bureau...) appartenant à un utilisateur."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='zones')
    name = models.CharField(max_length=120, verbose_name="Nom")
    description = models.TextField(blank=True, verbose_name="Description")
    camera_source = models.CharField(
        max_length=255, blank=True, verbose_name="Source caméra",
        help_text="Index de caméra locale (0, 1...) ou URL du flux (RTSP/HTTP).",
    )
    is_active = models.BooleanField(default=True, verbose_name="Zone active")
    threshold = models.FloatField(
        default=0.5, verbose_name="Seuil de reconnaissance",
        help_text="Distance maximale pour considérer un visage comme connu. Plus bas = plus strict.",
        validators=[MinValueValidator(0.3), MaxValueValidator(0.7)],
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Zone surveillée"
        verbose_name_plural = "Zones surveillées"
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(fields=['owner', 'name'], name='unique_zone_name_per_owner'),
        ]

    def __str__(self):
        return self.name


class KnownPerson(models.Model):
    class Status(models.TextChoices):
        AUTHORIZED = 'authorized', 'Autorisée'
        WATCHED = 'watched', 'Surveillée (liste noire)'
        VISITOR = 'visitor', 'Visiteur'

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='known_persons')
    full_name = models.CharField(max_length=150, verbose_name="Nom complet")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.AUTHORIZED)
    relation = models.CharField(max_length=100, blank=True, verbose_name="Lien (famille, employé...)")
    consent = models.BooleanField(default=False, verbose_name="Consentement au traitement biométrique")
    consent_date = models.DateTimeField(null=True, blank=True)
    valid_from = models.DateTimeField(null=True, blank=True, verbose_name="Valide à partir de")
    valid_to = models.DateTimeField(null=True, blank=True, verbose_name="Valide jusqu'à")
    zones = models.ManyToManyField(Zone, related_name='persons', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Personne connue"
        verbose_name_plural = "Personnes connues"
        ordering = ['full_name']

    def __str__(self):
        return self.full_name

    def save(self, *args, **kwargs):
        if self.consent and not self.consent_date:
            self.consent_date = timezone.now()
        super().save(*args, **kwargs)

    def is_valid_now(self, now=None):
        now = now or timezone.now()
        if self.valid_from and now < self.valid_from:
            return False
        if self.valid_to and now > self.valid_to:
            return False
        return True


class Face(models.Model):
    """Photo d'une personne + encodage (128 valeurs) calculé à l'envoi."""
    person = models.ForeignKey(KnownPerson, on_delete=models.CASCADE, related_name='faces')
    image = models.ImageField(upload_to=face_upload_path)
    encoding = models.JSONField()
    quality_score = models.FloatField(default=0)
    image_hash = models.CharField(max_length=64, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Visage"
        verbose_name_plural = "Visages"
        ordering = ['-quality_score', 'id']
        constraints = [
            models.UniqueConstraint(fields=['person', 'image_hash'], name='unique_face_hash_per_person'),
        ]

    def __str__(self):
        return f"Visage #{self.pk} de {self.person_id}"


def video_upload_path(instance, filename):
    """Enregistre les vidéos de surveillance dans media/videos/<owner_id>/<zone_id>/<uuid>.<ext>."""
    ext = os.path.splitext(filename)[1].lower() or '.mp4'
    return f"videos/{instance.zone.owner_id}/{instance.zone_id}/{uuid.uuid4().hex}{ext}"


class SurveillanceVideo(models.Model):
    """Vidéo de surveillance conservée dans media/ avec son rapport de détection complet."""
    zone = models.ForeignKey(Zone, on_delete=models.CASCADE, related_name='videos', verbose_name="Zone")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='surveillance_videos')
    video_file = models.FileField(upload_to=video_upload_path, verbose_name="Fichier vidéo")
    original_filename = models.CharField(max_length=255, blank=True, verbose_name="Nom de fichier d'origine")
    duration_seconds = models.FloatField(default=0.0, verbose_name="Durée (s)")
    alert_triggered = models.BooleanField(default=False, verbose_name="Alerte déclenchée")

    # Personnes connues identifiées
    known_persons = models.ManyToManyField(KnownPerson, related_name='detected_in_videos', blank=True)
    known_persons_names = models.JSONField(default=list, blank=True, verbose_name="Noms des personnes connues")
    known_snapshots = models.JSONField(default=list, blank=True, verbose_name="Vignettes personnes connues")

    # Personnes inconnues détectées
    unknown_count = models.IntegerField(default=0, verbose_name="Nombre d'inconnus distincts")
    unknown_snapshots = models.JSONField(default=list, blank=True, verbose_name="Vignettes personnes inconnues")

    # Chronologie complète
    timeline = models.JSONField(default=list, blank=True, verbose_name="Chronologie des détections")

    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Date d'enregistrement")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Vidéo de surveillance"
        verbose_name_plural = "Vidéos de surveillance"
        ordering = ['-created_at']

    def __str__(self):
        return f"Vidéo #{self.id} ({self.zone.name}) - {self.created_at.strftime('%Y-%m-%d %H:%M')}"
