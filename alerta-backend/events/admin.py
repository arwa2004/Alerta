from django.contrib import admin
from .models import Evenement, Zone, AlarmeConfig

@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display = ('nom', 'user', 'created_at')
    search_fields = ('nom', 'user__email')
    list_filter = ('created_at',)

@admin.register(Evenement)
class EvenementAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'type',
        'zone_affichee',
        'personne_nom',
        'niveau_criticite',
        'score_criticite',
        'date_heure',
        'statut_ia',
        'alerte_declenchee',
    )
    list_filter = ('type', 'niveau_criticite', 'statut_ia', 'alerte_declenchee', 'date_heure')
    search_fields = ('description', 'personne_nom', 'zone__nom', 'zone_nom_fallback')
    readonly_fields = ('score_criticite', 'niveau_criticite', 'created_at', 'updated_at')

@admin.register(AlarmeConfig)
class AlarmeConfigAdmin(admin.ModelAdmin):
    list_display = ('user', 'est_active', 'est_declenchee', 'derniere_commande', 'derniere_action', 'source_transcription', 'updated_at')
    list_filter = ('est_active', 'est_declenchee', 'source_transcription')
    search_fields = ('user__email', 'derniere_commande', 'derniere_action')
