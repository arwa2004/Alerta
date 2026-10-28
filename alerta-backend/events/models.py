from django.db import models
from django.conf import settings
from django.utils import timezone

class Zone(models.Model):
    """
    Zone surveillÃ©e par les camÃ©ras Alerta (ex: Salon, EntrÃ©e, Jardin).
    Permet l'intÃ©gration fluide avec le Module 1 de l'Ã©quipe.
    """
    nom = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='events_zones'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nom']

    def __str__(self):
        return f"{self.nom} ({self.user.email})"


class Evenement(models.Model):
    """
    ModÃ¨le central du Module 3 : Ã‰vÃ©nements de surveillance dÃ©tectÃ©s.
    Stocke la description gÃ©nÃ©rÃ©e par IA (Gemini), la reconstitution visuelle
    (Hugging Face), et le score de criticitÃ© calculÃ© par Machine Learning.
    """
    TYPE_CHOICES = [
        ('mouvement', 'Mouvement suspect'),
        ('visage_connu', 'Visage connu'),
        ('inconnu', 'Personne inconnue'),
    ]

    STATUT_IA_CHOICES = [
        ('en_attente', 'En attente'),
        ('ok', 'GÃ©nÃ©rÃ© avec succÃ¨s'),
        ('erreur', 'Ã‰chec gÃ©nÃ©ration'),
    ]

    NIVEAU_CRITICITE_CHOICES = [
        ('faible', 'Faible'),
        ('moyen', 'Moyen'),
        ('eleve', 'Ã‰levÃ©'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='evenements',
        verbose_name="PropriÃ©taire"
    )
    zone = models.ForeignKey(
        Zone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='evenements',
        verbose_name="Zone surveillÃ©e"
    )
    zone_nom_fallback = models.CharField(
        max_length=100,
        blank=True,
        default='EntrÃ©e Principale',
        help_text="Nom de la zone si aucune zone FK n'est sÃ©lectionnÃ©e"
    )

    type = models.CharField(
        max_length=30,
        choices=TYPE_CHOICES,
        default='mouvement',
        verbose_name="Type d'Ã©vÃ©nement"
    )

    personne_nom = models.CharField(
        max_length=120,
        blank=True,
        default='',
        verbose_name="Personne identifiÃ©e (Module 1)"
    )

    description = models.TextField(
        blank=True,
        default='',
        verbose_name="Description gÃ©nÃ©rÃ©e (Gemini)"
    )

    DESCRIPTION_SOURCE_CHOICES = [
        ('gemini_vision', 'Gemini Vision (Image rÃ©elle)'),
        ('gemini_texte', 'SynthÃ¨se Gemini'),
        ('simulation', 'ScÃ©nario simulÃ©'),
    ]

    description_source = models.CharField(
        max_length=30,
        choices=DESCRIPTION_SOURCE_CHOICES,
        default='simulation',
        verbose_name="Origine de la description"
    )

    photo_capturee = models.ImageField(
        upload_to='events/captures/',
        blank=True,
        null=True,
        verbose_name="Photo rÃ©elle capturÃ©e (Module 2)"
    )

    date_heure = models.DateTimeField(
        default=timezone.now,
        verbose_name="Date et heure de dÃ©tection"
    )

    score_confiance = models.FloatField(
        default=0.85,
        verbose_name="Score de confiance faciale (0.0 - 1.0)"
    )

    score_criticite = models.FloatField(
        default=0.0,
        verbose_name="Score de criticitÃ© ML (0.0 - 1.0)"
    )

    niveau_criticite = models.CharField(
        max_length=20,
        choices=NIVEAU_CRITICITE_CHOICES,
        default='faible',
        verbose_name="Niveau de criticitÃ©"
    )

    IMAGE_SOURCE_CHOICES = [
        ('hf', 'Hugging Face (FLUX.1)'),
        ('ia_ouverte', 'IA GÃ©nÃ©rative Ouverte (FLUX.1)'),
        ('simulation', 'Simulation locale'),
    ]

    image_source = models.CharField(
        max_length=30,
        choices=IMAGE_SOURCE_CHOICES,
        default='simulation',
        verbose_name="Origine de l'image"
    )

    image_reconstituee = models.ImageField(
        upload_to='events/reconstitutions/',
        blank=True,
        null=True,
        verbose_name="Image de reconstitution (Hugging Face)"
    )

    statut_ia = models.CharField(
        max_length=20,
        choices=STATUT_IA_CHOICES,
        default='en_attente',
        verbose_name="Statut des traitements IA"
    )

    alerte_declenchee = models.BooleanField(
        default=False,
        verbose_name="Alerte dÃ©clenchÃ©e vers Module 4"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date_heure']
        verbose_name = "Ã‰vÃ©nement"
        verbose_name_plural = "Ã‰vÃ©nements"

    def __str__(self):
        zone_str = self.zone.nom if self.zone else self.zone_nom_fallback
        return f"[{self.get_type_display()}] {zone_str} - {self.date_heure.strftime('%d/%m/%Y %H:%M')}"

    @property
    def zone_affichee(self):
        return self.zone.nom if self.zone else self.zone_nom_fallback
