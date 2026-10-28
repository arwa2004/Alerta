from django.contrib import admin

from .models import SurveillanceVideo, Zone


@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    """Seules les zones sont visibles dans l'admin Django.

    KnownPerson et Face ne sont volontairement PAS enregistrés : les visages sont
    des données biométriques que même l'administrateur ne doit pas consulter.
    """
    list_display = ['name', 'owner', 'is_active', 'threshold', 'created_at']
    list_filter = ['is_active']
    search_fields = ['name', 'owner__email']


@admin.register(SurveillanceVideo)
class SurveillanceVideoAdmin(admin.ModelAdmin):
    list_display = ['id', 'zone', 'uploaded_by', 'duration_seconds', 'alert_triggered', 'unknown_count', 'created_at']
    list_filter = ['alert_triggered', 'zone']
    search_fields = ['original_filename', 'uploaded_by__email', 'zone__name']
