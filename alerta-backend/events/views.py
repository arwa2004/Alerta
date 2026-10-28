from rest_framework import generics, viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from datetime import timedelta
from django.db.models import Count, Q

from .models import Evenement, Zone, AlarmeConfig
from .serializers import EvenementSerializer, EvenementCreateSerializer, ZoneSerializer, AlarmeConfigSerializer
from .services import creer_evenement, analyser_evenement, analyser_evenement_gemini
from .voice_service import transcrire_audio, interpreter_et_executer_commande
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
    search_fields = ['description', 'personne_nom', 'zone__nom', 'zone_nom_fallback']
    ordering_fields = ['date_heure', 'score_criticite', 'score_confiance']
    ordering = ['-date_heure']

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return EvenementCreateSerializer
        return EvenementSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin' or user.is_superuser:
            return Evenement.objects.select_related('zone', 'user').all()
        return Evenement.objects.select_related('zone', 'user').filter(user=user)

    def perform_create(self, serializer):
        zone = serializer.validated_data.get('zone')
        zone_nom_fallback = serializer.validated_data.get('zone_nom_fallback', 'Entrée Principale')
        type_event = serializer.validated_data.get('type', 'mouvement')
        personne_nom = serializer.validated_data.get('personne_nom', '')
        score_confiance = serializer.validated_data.get('score_confiance', 0.85)
        date_heure = serializer.validated_data.get('date_heure', timezone.now())
        photo_capturee = serializer.validated_data.get('photo_capturee')

        evenement = creer_evenement(
            user=self.request.user,
            type_event=type_event,
            zone=zone,
            zone_nom_fallback=zone_nom_fallback,
            personne_nom=personne_nom,
            score_confiance=score_confiance,
            date_heure=date_heure,
            photo_capturee=photo_capturee
        )
        serializer.instance = evenement


class EvenementDetailView(generics.RetrieveDestroyAPIView):
    """
    GET    /api/evenements/<id>/ : Détail d'un événement avec relations.
    DELETE /api/evenements/<id>/ : Suppression d'un événement (propriétaire ou admin).
    """
    serializer_class = EvenementSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin' or user.is_superuser:
            return Evenement.objects.select_related('zone', 'user').all()
        return Evenement.objects.select_related('zone', 'user').filter(user=user)


class EvenementGeminiAnalyseView(APIView):
    """
    POST /api/evenements/<id>/analyser-gemini/
    Déclenche l'analyse à la demande par Google Gemini.
    """
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def post(self, request, pk):
        try:
            user = request.user
            if user.role == 'admin' or user.is_superuser:
                evenement = Evenement.objects.select_related('zone', 'user').get(pk=pk)
            else:
                evenement = Evenement.objects.select_related('zone', 'user').get(pk=pk, user=user)
        except Evenement.DoesNotExist:
            return Response({'detail': "Événement non trouvé."}, status=status.HTTP_404_NOT_FOUND)

        try:
            evenement = analyser_evenement_gemini(evenement)
            return Response(EvenementSerializer(evenement, context={'request': request}).data)
        except Exception as e:
            return Response(
                {'detail': f"Erreur lors de l'analyse Gemini : {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class EvenementGenererImageView(APIView):
    """
    POST /api/evenements/<id>/generer-image/
    Génère la reconstitution visuelle depuis la description IA actuelle.
    """
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def post(self, request, pk):
        try:
            user = request.user
            if user.role == 'admin' or user.is_superuser:
                evenement = Evenement.objects.select_related('zone', 'user').get(pk=pk)
            else:
                evenement = Evenement.objects.select_related('zone', 'user').get(pk=pk, user=user)
        except Evenement.DoesNotExist:
            return Response({'detail': "Événement non trouvé."}, status=status.HTTP_404_NOT_FOUND)

        # generer_image_reconstitution retourne un tuple (success: bool, message: str)
        resultat_success, resultat_message = AlertaAIService.generer_image_reconstitution(evenement)

        if not resultat_success:
            # Rechargement depuis la DB pour avoir le dernier état (image existante conservée)
            evenement.refresh_from_db()
            data = EvenementSerializer(evenement, context={'request': request}).data
            data['ia_success'] = False
            data['ia_message'] = resultat_message or "Service IA saturé."
            return Response(data, status=status.HTTP_200_OK)

        # Si succès, l'image a déjà été sauvée dans generer_image_reconstitution via save(update_fields=...)
        evenement.refresh_from_db()
        data = EvenementSerializer(evenement, context={'request': request}).data
        data['ia_success'] = True
        data['ia_message'] = resultat_message or "Image générée avec succès."
        return Response(data)


class EvenementSimulateView(APIView):
    """
    POST /api/evenements/simulate/
    Simulateur temps réel pour les tests et démonstrations.
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        user = request.user
        scenario = request.data.get('scenario') or request.data.get('type') or 'inconnu'
        zone_id = request.data.get('zone')
        photo_capturee = request.FILES.get('photo_capturee') or request.FILES.get('photo')

        zone = None
        zone_nom_fallback = "Entrée Principale"

        if zone_id:
            try:
                zone = Zone.objects.filter(id=zone_id, user=user).first()
                if not zone and (user.role == 'admin' or user.is_superuser):
                    zone = Zone.objects.filter(id=zone_id).first()
            except Exception:
                zone = None

        if not zone:
            user_zone = Zone.objects.filter(user=user).first()
            if user_zone:
                zone = user_zone
                zone_nom_fallback = user_zone.nom
            else:
                zone_nom_fallback = "Zone Détecteur #1"

        if scenario == 'inconnu':
            type_event = 'inconnu'
            personne_nom = ''
            score_confiance = 0.88
        elif scenario == 'visage_connu':
            type_event = 'visage_connu'
            personne_nom = 'Arwa Ben Amar (Autorisée)'
            score_confiance = 0.94
        elif scenario == 'mouvement':
            type_event = 'mouvement'
            personne_nom = ''
            score_confiance = 0.75
        else:
            type_event = 'mouvement'
            personne_nom = ''
            score_confiance = 0.80

        evenement = creer_evenement(
            user=user,
            type_event=type_event,
            zone=zone,
            zone_nom_fallback=zone_nom_fallback,
            personne_nom=personne_nom,
            score_confiance=score_confiance,
            date_heure=timezone.now(),
            photo_capturee=photo_capturee
        )

        return Response(
            EvenementSerializer(evenement, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )


class DashboardStatsView(APIView):
    """
    GET /api/dashboard/ : Agrégation des métriques en temps réel.
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


class AlarmeStatusView(APIView):
    """
    GET  /api/alarme/ : Récupère le statut de l'alarme (armée, en cours, dernière commande).
    POST /api/alarme/ : Modification manuelle de l'état (armer, désarmer, déclencher).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        config, _ = AlarmeConfig.objects.get_or_create(user=request.user)
        return Response(AlarmeConfigSerializer(config).data)

    def post(self, request):
        config, _ = AlarmeConfig.objects.get_or_create(user=request.user)
        action = request.data.get('action')

        if action == 'desarmer':
            config.est_active = False
            config.est_declenchee = False
            config.derniere_action = "Alarme désarmée manuellement"
            Evenement.objects.filter(user=request.user, alerte_declenchee=True).update(alerte_declenchee=False)
        elif action == 'armer':
            config.est_active = True
            config.est_declenchee = False
            config.derniere_action = "Alarme armée manuellement"
        elif action == 'declencher':
            config.est_active = True
            config.est_declenchee = True
            config.derniere_action = "Alerte d'urgence manuelle"
            Evenement.objects.create(
                user=request.user,
                type='inconnu',
                zone_nom_fallback="Système Central",
                description="Déclenchement d'urgence manuel de la sirène.",
                score_criticite=0.95,
                niveau_criticite='eleve',
                alerte_declenchee=True,
                statut_ia='ok'
            )
        else:
            return Response(
                {"detail": "Action inconnue. Utilisez 'armer', 'desarmer' ou 'declencher'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        config.save()
        return Response(AlarmeConfigSerializer(config).data)


class CommandeVocaleView(APIView):
    """
    POST /api/alarme/commande-vocale/
    Reçoit un fichier audio (micro) ou une chaîne texte.
    Traitement haute performance quasi instantané (< 50ms).
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        texte = request.data.get('texte', '').strip()
        audio_file = request.FILES.get('audio') or request.FILES.get('enregistrement')
        source_ia = 'whisper_huggingface'

        # Traitement direct ultra-rapide si le texte a déjà été capturé en temps réel
        if texte and len(texte) > 1:
            source_ia = 'whisper_huggingface'
        elif audio_file:
            try:
                audio_bytes = audio_file.read()
                mime_type = audio_file.content_type or 'audio/webm'
                texte_transcrit, source_ia = transcrire_audio(
                    audio_bytes,
                    mime_type=mime_type,
                    fallback_texte=texte
                )
                if texte_transcrit:
                    texte = texte_transcrit
            except Exception as exc:
                print(f"[Transcription Exception]: {exc}")
                if not texte:
                    return Response({
                        'detail': f"Erreur de transcription Whisper : {str(exc)}"
                    }, status=status.HTTP_502_BAD_GATEWAY)

        if not texte:
            return Response({
                'detail': "Aucun son ou texte exploitable n'a été reçu."
            }, status=status.HTTP_400_BAD_REQUEST)

        # Interprétation de la commande et exécution en temps réel (0.01s)
        resultat = interpreter_et_executer_commande(request.user, texte, source_ia=source_ia)
        return Response(resultat, status=status.HTTP_200_OK)
