from django.contrib import admin

from .models import Zone


@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    """Seules les zones sont visibles dans l'admin Django.

    KnownPerson et Face ne sont volontairement PAS enregistrés : les visages sont
    des données biométriques que même l'administrateur ne doit pas consulter.
    """
    list_display = ['name', 'owner', 'is_active', 'threshold', 'created_at']
    list_filter = ['is_active']
    search_fields = ['name', 'owner__email']
