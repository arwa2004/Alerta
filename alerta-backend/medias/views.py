from django.db.models import Count, Q, Sum
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from .models import Media
from .serializers import (AdminMediaDetailSerializer, AdminMediaSerializer,
                          MediaDetailSerializer, MediaSerializer)
from .services.traitement import lancer_traitement
from django.core.files import File
from rest_framework import status

class EstAdmin(BasePermission):
    """Réservé aux administrateurs (champ `role` d'Arwa, ou staff/superuser Django)."""

    def has_permission(self, request, view):
        u = request.user
        return bool(
            u and u.is_authenticated
            and (getattr(u, "role", None) == "admin" or u.is_staff or u.is_superuser)
        )


def _filtrer(queryset, params):
    for cle, champ in (("zone", "zone_id"), ("statut", "statut"), ("type", "type"), ("owner", "owner_id")):
        valeur = params.get(cle)
        if valeur:
            queryset = queryset.filter(**{champ: valeur})
    return queryset


# ── API utilisateur : uniquement SES médias ─────────────────────────────────────
class MediaViewSet(mixins.CreateModelMixin, mixins.ListModelMixin,
                   mixins.RetrieveModelMixin, mixins.DestroyModelMixin,
                   viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_serializer_class(self):
        return MediaDetailSerializer if self.action == "retrieve" else MediaSerializer

    def get_queryset(self):
        queryset = Media.objects.filter(owner=self.request.user).select_related("zone")
        return _filtrer(queryset, self.request.query_params)

    def perform_create(self, serializer):
        media = serializer.save()
        lancer_traitement(media.id)

    @action(detail=True, methods=["post"])
    def reanalyser(self, request, pk=None):
        media = self.get_object()
        media.statut = Media.Statut.EN_ATTENTE
        media.message_erreur = ""
        media.save(update_fields=["statut", "message_erreur"])
        lancer_traitement(media.id)
        return Response(MediaSerializer(media, context={"request": request}).data)
    
    @action(detail=True, methods=["post"], url_path="verifier-authenticite")
    def verifier_authenticite(self, request, pk=None):
        """Crée (ou relance) une analyse d'authenticité à partir de ce média."""
        from authenticite.models import AnalyseAuthenticite as A
        from authenticite.serializers import AnalyseSerializer
        from authenticite.services.traitement import lancer_traitement as lancer_auth
        from authenticite.views import _relancer

        media = self.get_object()            # limité aux médias de l'utilisateur
        contexte = {"request": request}

        existante = A.objects.filter(owner=request.user, media_source=media).first()
        if existante:
            if existante.statut == A.Statut.ERREUR:
                _relancer(existante)
            return Response(AnalyseSerializer(existante, context=contexte).data)

        analyse = A(owner=request.user, media_source=media, nom_original=media.nom_original,
                    type=media.type, taille=media.taille)
        with media.fichier.open("rb") as f:
            analyse.fichier.save(media.nom_original, File(f), save=True)
        lancer_auth(analyse.id)
        return Response(AnalyseSerializer(analyse, context=contexte).data, status=status.HTTP_201_CREATED)

# ── API administrateur : TOUS les médias ────────────────────────────────────────
class AdminMediaViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                        mixins.DestroyModelMixin, viewsets.GenericViewSet):
    permission_classes = [EstAdmin]

    def get_serializer_class(self):
        return AdminMediaDetailSerializer if self.action == "retrieve" else AdminMediaSerializer

    def get_queryset(self):
        queryset = Media.objects.select_related("zone", "owner")
        queryset = _filtrer(queryset, self.request.query_params)
        recherche = self.request.query_params.get("search")
        if recherche:
            queryset = queryset.filter(
                Q(owner__email__icontains=recherche)
                | Q(owner__first_name__icontains=recherche)
                | Q(owner__last_name__icontains=recherche)
                | Q(nom_original__icontains=recherche)
            )
        return queryset

    @action(detail=True, methods=["post"])
    def reanalyser(self, request, pk=None):
        media = self.get_object()
        media.statut = Media.Statut.EN_ATTENTE
        media.message_erreur = ""
        media.save(update_fields=["statut", "message_erreur"])
        lancer_traitement(media.id)
        return Response(AdminMediaSerializer(media, context={"request": request}).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = Media.objects.all()
        par_statut = {ligne["statut"]: ligne["n"] for ligne in qs.values("statut").annotate(n=Count("id"))}
        top = (qs.values("owner_id", "owner__email")
                 .annotate(n=Count("id"), taille=Sum("taille"))
                 .order_by("-n")[:5])
        return Response({
            "total": qs.count(),
            "photos": qs.filter(type=Media.Type.PHOTO).count(),
            "videos": qs.filter(type=Media.Type.VIDEO).count(),
            "alertes": qs.filter(resultats__alert_triggered=True).count(),
            "taille_totale": qs.aggregate(t=Sum("taille"))["t"] or 0,
            "par_statut": par_statut,
            "top_utilisateurs": [
                {"id": t["owner_id"], "email": t["owner__email"], "medias": t["n"], "taille": t["taille"] or 0}
                for t in top
            ],
        })