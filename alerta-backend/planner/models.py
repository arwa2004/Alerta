import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from .storage import PrivateMediaStorage

private_storage = PrivateMediaStorage()


def floorplan_pdf_path(instance, filename):
    # Nom aléatoire : le nom fourni par l'utilisateur n'est jamais utilisé sur disque.
    return f"floorplans/{instance.project_id}/{uuid.uuid4().hex}.pdf"


def floorplan_image_path(instance, filename):
    return f"floorplans/{instance.project_id}/{uuid.uuid4().hex}.png"


class Project(models.Model):
    CURRENCY_CHOICES = (
        ('TND', 'Dinar tunisien (TND)'),
        ('EUR', 'Euro (EUR)'),
        ('USD', 'Dollar américain (USD)'),
    )

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='projects',
        verbose_name="Propriétaire",
    )
    name = models.CharField(max_length=120, verbose_name="Nom du projet")
    budget = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))], verbose_name="Budget",
    )
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='TND', verbose_name="Devise")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Projet"
        verbose_name_plural = "Projets"

    def __str__(self):
        return f"{self.name} ({self.owner_id})"


class FloorPlan(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='floor_plans')
    original_filename = models.CharField(max_length=255)
    pdf_file = models.FileField(upload_to=floorplan_pdf_path, storage=private_storage)
    file_size = models.PositiveIntegerField(help_text="Taille du PDF en octets")
    sha256 = models.CharField(max_length=64, db_index=True)
    page_count = models.PositiveIntegerField()
    selected_page = models.PositiveIntegerField(default=1, help_text="Page rendue (commence à 1)")
    image_file = models.FileField(upload_to=floorplan_image_path, storage=private_storage)
    image_width = models.PositiveIntegerField()
    image_height = models.PositiveIntegerField()
    render_dpi = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Plan d'étage"
        verbose_name_plural = "Plans d'étage"

    def __str__(self):
        return f"{self.original_filename} (projet {self.project_id})"
class FloorPlanAnalysis(models.Model):
    floor_plan = models.OneToOneField(
        FloorPlan, on_delete=models.CASCADE, related_name="analysis")
    result_json = models.JSONField(default=dict)
    confidence = models.FloatField(default=0.0)
    warnings = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Analysis of floor plan {self.floor_plan_id}"


class CameraOptimization(models.Model):
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="optimizations")
    budget = models.DecimalField(max_digits=12, decimal_places=2)
    camera_config = models.JSONField(default=dict)
    result_json = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Optimization {self.pk} (budget {self.budget})"
