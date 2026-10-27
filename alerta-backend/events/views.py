from rest_framework import generics, viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from datetime import timedelta
from django.db.models import Count, Q

from .models import Evenement, Zone
from .serializers import EvenementSerializer, EvenementCreateSerializer, ZoneSerializer
from .services import creer_evenement, analyser_evenement, analyser_evenement_gemini
from .ai import AlertaAIService
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
        if user.role == 'admin' or user.is_superuser:
            qs = Evenement.objects.all().select_related('user', 'zone')
        else:
            qs = Evenement.objects.filter(user=user).select_related('user', 'zone')

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

        evenement = creer_evenement(
            user=request.user,
            type_event=data.get('type', 'mouvement'),
            zone=data.get('zone'),
            zone_nom_fallback=data.get('zone_nom_fallback', 'Entrée Principale'),
            personne_nom=data.get('personne_nom', ''),
            score_confiance=data.get('score_confiance', 0.85),
            date_heure=data.get('date_heure', timezone.now()),
            photo_capturee=data.get('photo_capturee')
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


ALLOWED_IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp")
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 Mo


class EvenementGeminiAnalyseView(APIView):
    """
    POST /api/evenements/{id}/analyser-gemini/
    Déclenché explicitement par le bouton utilisateur pour générer l'analyse IA Gemini.
    """
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def post(self, request, pk):
        try:
            evenement = Evenement.objects.get(pk=pk)
        except Evenement.DoesNotExist:
            return Response({'detail': 'Événement non trouvé.'}, status=status.HTTP_404_NOT_FOUND)

        self.check_object_permissions(request, evenement)
        evenement = analyser_evenement(evenement)
        return Response(EvenementSerializer(evenement, context={'request': request}).data)


class EvenementSimulateView(APIView):
    """
    POST /api/evenements/simulate/
    Générateur d'événements de démonstration (supporte JSON ou multipart avec photo_capturee).
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        import random

        photo = request.FILES.get("photo_capturee")
        if photo:
            if photo.content_type not in ALLOWED_IMAGE_TYPES:
                return Response({"detail": "Format image non supporté."}, status=status.HTTP_400_BAD_REQUEST)
            if photo.size > MAX_IMAGE_SIZE:
                return Response({"detail": "Image trop lourde (5 Mo max)."}, status=status.HTTP_400_BAD_REQUEST)

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

        choice = request.data.get('scenario') or request.data.get('type')
        if choice and choice in ['inconnu', 'visage_connu', 'mouvement']:
            matching = [s for s in scenarios if s['type'] == choice]
            scenario = matching[0] if matching else scenarios[0]
        else:
            scenario = random.choice(scenarios)

        type_event = request.data.get('type') or scenario['type']
        zone_nom = request.data.get('zone') or request.data.get('zone_nom_fallback') or scenario['zone_nom_fallback']
        personne_nom = request.data.get('personne_nom', scenario['personne_nom'])
        
        try:
            score_confiance = float(request.data.get('score_confiance', scenario['score_confiance']))
        except (ValueError, TypeError):
            score_confiance = scenario['score_confiance']

        evenement = creer_evenement(
            user=request.user,
            type_event=type_event,
            zone_nom_fallback=zone_nom,
            personne_nom=personne_nom,
            score_confiance=score_confiance,
            photo_capturee=photo,
            date_heure=timezone.now()
        )

        return Response(
            EvenementSerializer(evenement, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )


class EvenementGenererImageView(APIView):
    """
    POST /api/evenements/{id}/generer-image/
    Déclenché par le bouton "Générer image" dans la modale.
    Génère (ou régénère) l'image de reconstitution depuis la description IA actuelle de l'événement.
    """
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def post(self, request, pk):
        try:
            evenement = Evenement.objects.get(pk=pk)
        except Evenement.DoesNotExist:
            return Response({'detail': 'Événement non trouvé.'}, status=status.HTTP_404_NOT_FOUND)

        self.check_object_permissions(request, evenement)

        success, message = AlertaAIService.generer_image_reconstitution(evenement)
        evenement.refresh_from_db()

        data = EvenementSerializer(evenement, context={'request': request}).data
        data['ia_success'] = success
        data['ia_message'] = message
        return Response(data, status=status.HTTP_200_OK)


class DashboardStatsView(APIView):
    """
    GET /api/dashboard/
    Statistiques consolidées pour l'Accueil Utilisateur et l'Admin.
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
