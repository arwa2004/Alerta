from django.urls import path
from .views import (
    EvenementListCreateView,
    EvenementDetailView,
    EvenementGeminiAnalyseView,
    EvenementGenererImageView,
    EvenementSimulateView,
    DashboardStatsView,
    ZoneListCreateView,
    AlarmeStatusView,
    CommandeVocaleView,
)

urlpatterns = [
    # Gestion des événements
    path('evenements/', EvenementListCreateView.as_view(), name='evenements-list-create'),
    path('evenements/<int:pk>/', EvenementDetailView.as_view(), name='evenements-detail'),
    path('evenements/<int:pk>/analyser-gemini/', EvenementGeminiAnalyseView.as_view(), name='evenements-gemini-analyse'),
    path('evenements/<int:pk>/generer-image/', EvenementGenererImageView.as_view(), name='evenements-generer-image'),
    path('evenements/simulate/', EvenementSimulateView.as_view(), name='evenements-simulate'),

    # Module 4 - Voix & Alarme (Whisper Hugging Face)
    path('alarme/', AlarmeStatusView.as_view(), name='alarme-status'),
    path('alarme/commande-vocale/', CommandeVocaleView.as_view(), name='alarme-commande-vocale'),

    # Tableau de bord consolidé (statistiques et alertes)
    path('dashboard/', DashboardStatsView.as_view(), name='dashboard-stats'),

    # Zones de surveillance
    path('zones/', ZoneListCreateView.as_view(), name='zones-list-create'),
]
