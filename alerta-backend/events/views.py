from rest_framework import generics, viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from datetime import timedelta
from django.db.models import Count, Q

from .models import Evenement, Zone
from .serializers import EvenementSerializer, EvenementCreateSerializer, ZoneSerializer
from .services import creer_evenement
from users.permissions import IsOwnerOrAdmin, IsAdminUserRole

class ZoneListCreateView(generics.ListCreateAPIView):
    """
    Gestion des zones surveillées par l'utilisateur.
    """
    serializer_class = ZoneSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin' or user.is_superuser:
            return Zone.objects.all()
        return Zone.objects.filter(user=user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class EvenementListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/evenements/ : Liste paginée des événements avec recherche et filtres.
    POST /api/evenements/ : Création d'un événement (avec IA et ML automatiques).
    """
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['type', 'niveau_criticite', 'zone', 'statut_ia', 'alerte_declenchee']
    search_fields = ['description', 'personne_nom', 'zone_nom_fallback', 'zone__nom']
    ordering_fields = ['date_heure', 'score_criticite', 'score_confiance']
    ordering = ['-date_heure']

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return EvenementCreateSerializer
        return EvenementSerializer

    def get_queryset(self):
        user = self.request.user
        # Isolation stricte des données : admin voit tout, user normal voit uniquement les siennes
        if user.role == 'admin' or user.is_superuser:
            qs = Evenement.objects.all().select_related('user', 'zone')
        else:
            qs = Evenement.objects.filter(user=user).select_related('user', 'zone')

        # Filtre optionnel par période (date_debut, date_fin)
        date_debut = self.request.query_params.get('date_debut')
        date_fin = self.request.query_params.get('date_fin')
        if date_debut:
            qs = qs.filter(date_heure__gte=date_debut)
        if date_fin:
            qs = qs.filter(date_heure__lte=date_fin)

        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Appel du service métier central
        evenement = creer_evenement(
            user=request.user,
            type_event=data.get('type', 'mouvement'),
            zone=data.get('zone'),
            zone_nom_fallback=data.get('zone_nom_fallback', 'Entrée Principale'),
            personne_nom=data.get('personne_nom', ''),
            score_confiance=data.get('score_confiance', 0.85),
            date_heure=data.get('date_heure', timezone.now())
        )

        output_serializer = EvenementSerializer(evenement, context={'request': request})
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class EvenementDetailView(generics.RetrieveDestroyAPIView):
    """
    GET    /api/evenements/{id}/ : Consultation détaillée d'un événement.
    DELETE /api/evenements/{id}/ : Suppression d'un événement.
    """
    serializer_class = EvenementSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin' or user.is_superuser:
            return Evenement.objects.all().select_related('user', 'zone')
        return Evenement.objects.filter(user=user).select_related('user', 'zone')


class EvenementSimulateView(APIView):
    """
    POST /api/evenements/simulate/
    Générateur d'événements de démonstration en un clic (très utile pour soutenance et tests).
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        import random
        scenarios = [
            {
                'type': 'inconnu',
                'zone_nom_fallback': 'Entrée Principale',
                'personne_nom': '',
                'score_confiance': 0.88,
            },
            {
                'type': 'visage_connu',
                'zone_nom_fallback': 'Salon',
                'personne_nom': request.user.first_name or 'Arwa',
                'score_confiance': 0.96,
            },
            {
                'type': 'mouvement',
                'zone_nom_fallback': 'Jardin / Périmètre',
                'personne_nom': '',
                'score_confiance': 0.72,
            },
            {
                'type': 'inconnu',
                'zone_nom_fallback': 'Garage',
                'personne_nom': '',
                'score_confiance': 0.82,
            }
        ]

        choice = request.data.get('scenario')
        if choice and choice in ['inconnu', 'visage_connu', 'mouvement']:
            scenario = next(s for s in scenarios if s['type'] == choice)
        else:
            scenario = random.choice(scenarios)

        evenement = creer_evenement(
            user=request.user,
            type_event=scenario['type'],
            zone_nom_fallback=scenario['zone_nom_fallback'],
            personne_nom=scenario['personne_nom'],
            score_confiance=scenario['score_confiance'],
            date_heure=timezone.now()
        )

        return Response(
            EvenementSerializer(evenement, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )


class DashboardStatsView(APIView):
    """
    GET /api/dashboard/
    Fournit les statistiques consolidées pour l'Accueil Utilisateur et l'Admin :
    - Compteurs totaux, événements aujourd'hui, alertes critiques
    - Répartition par type d'événement
    - Répartition par criticité ML
    - 5 derniers événements récents
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role == 'admin' or user.is_superuser:
            qs = Evenement.objects.all()
        else:
            qs = Evenement.objects.filter(user=user)

        maintenant = timezone.now()
        debut_journee = maintenant.replace(hour=0, minute=0, second=0, microsecond=0)

        total_evenements = qs.count()
        evenements_aujourdhui = qs.filter(date_heure__gte=debut_journee).count()
        inconnus_count = qs.filter(type='inconnu').count()
        visages_connus_count = qs.filter(type='visage_connu').count()
        mouvements_count = qs.filter(type='mouvement').count()
        critiques_count = qs.filter(niveau_criticite='eleve').count()
        alertes_count = qs.filter(alerte_declenchee=True).count()

        # Derniers événements (les 5 plus récents)
        derniers = qs.order_by('-date_heure')[:5]
        derniers_data = EvenementSerializer(derniers, many=True, context={'request': request}).data

        return Response({
            'total_evenements': total_evenements,
            'evenements_aujourdhui': evenements_aujourdhui,
            'inconnus_count': inconnus_count,
            'visages_connus_count': visages_connus_count,
            'mouvements_count': mouvements_count,
            'critiques_count': critiques_count,
            'alertes_count': alertes_count,
            'repartition_types': {
                'visage_connu': visages_connus_count,
                'mouvement': mouvements_count,
                'inconnu': inconnus_count,
            },
            'derniers_evenements': derniers_data,
        })
