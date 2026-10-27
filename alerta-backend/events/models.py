from django.db import models
from django.conf import settings
from django.utils import timezone

class Zone(models.Model):
    """
    Zone surveillée par les caméras Alerta (ex: Salon, Entrée, Jardin).
    Permet l'intégration fluide avec le Module 1 de l'équipe.
    """
    nom = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='zones'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['nom']

    def __str__(self):
        return f"{self.nom} ({self.user.email})"


class Evenement(models.Model):
    """
    Modèle central du Module 3 : Événements de surveillance détectés.
    Stocke la description générée par IA (Gemini), la reconstitution visuelle
    (Hugging Face), et le score de criticité calculé par Machine Learning.
    """
    TYPE_CHOICES = [
        ('mouvement', 'Mouvement suspect'),
        ('visage_connu', 'Visage connu'),
        ('inconnu', 'Personne inconnue'),
    ]

    STATUT_IA_CHOICES = [
        ('en_attente', 'En attente'),
        ('ok', 'Généré avec succès'),
        ('erreur', 'Échec génération'),
    ]

    NIVEAU_CRITICITE_CHOICES = [
        ('faible', 'Faible'),
        ('moyen', 'Moyen'),
        ('eleve', 'Élevé'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='evenements',
        verbose_name="Propriétaire"
    )
    zone = models.ForeignKey(
        Zone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='evenements',
        verbose_name="Zone surveillée"
    )
    zone_nom_fallback = models.CharField(
        max_length=100,
        blank=True,
        default='Entrée Principale',
        help_text="Nom de la zone si aucune zone FK n'est sélectionnée"
    )

    type = models.CharField(
        max_length=30,
        choices=TYPE_CHOICES,
        default='mouvement',
        verbose_name="Type d'événement"
    )

    personne_nom = models.CharField(
        max_length=120,
        blank=True,
        default='',
        verbose_name="Personne identifiée (Module 1)"
    )

    description = models.TextField(
        blank=True,
        default='',
        verbose_name="Description générée (Gemini)"
    )

    date_heure = models.DateTimeField(
        default=timezone.now,
        verbose_name="Date et heure de détection"
    )

    score_confiance = models.FloatField(
        default=0.85,
        verbose_name="Score de confiance faciale (0.0 - 1.0)"
    )

    score_criticite = models.FloatField(
        default=0.0,
        verbose_name="Score de criticité ML (0.0 - 1.0)"
    )

    niveau_criticite = models.CharField(
        max_length=20,
        choices=NIVEAU_CRITICITE_CHOICES,
        default='faible',
        verbose_name="Niveau de criticité"
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
        verbose_name="Alerte déclenchée vers Module 4"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date_heure']
        verbose_name = "Événement"
        verbose_name_plural = "Événements"

    def __str__(self):
        zone_str = self.zone.nom if self.zone else self.zone_nom_fallback
        return f"[{self.get_type_display()}] {zone_str} - {self.date_heure.strftime('%d/%m/%Y %H:%M')}"

    @property
    def zone_affichee(self):
        return self.zone.nom if self.zone else self.zone_nom_fallback
