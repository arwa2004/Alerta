from django.db.models import Avg, Count, Q
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from medias.views import EstAdmin          # même permission que l'admin des médias

from .models import AnalyseAuthenticite as A
from .serializers import (AdminAnalyseDetailSerializer, AdminAnalyseSerializer,
                          AnalyseDetailSerializer, AnalyseSerializer)
from .services.traitement import lancer_traitement


def _filtrer(qs, params):
    for cle, champ in (("statut", "statut"), ("verdict", "verdict"), ("type", "type"), ("owner", "owner_id")):
        valeur = params.get(cle)
        if valeur:
            qs = qs.filter(**{champ: valeur})
    return qs


def _relancer(analyse):
    if analyse.carte_ela:
        analyse.carte_ela.delete(save=False)
    analyse.statut = A.Statut.EN_ATTENTE
    analyse.message_erreur = ""
    analyse.score, analyse.verdict, analyse.details, analyse.date_fin = None, "", {}, None
    analyse.save()
    lancer_traitement(analyse.id)


class SuppressionAvecFichiers:
    def perform_destroy(self, instance):
        instance.fichier.delete(save=False)
        if instance.carte_ela:
            instance.carte_ela.delete(save=False)
        instance.delete()


# ── API utilisateur : uniquement SES analyses ──────────────────────────────
class AnalyseViewSet(SuppressionAvecFichiers, mixins.CreateModelMixin, mixins.ListModelMixin,
                     mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_serializer_class(self):
        return AnalyseDetailSerializer if self.action == "retrieve" else AnalyseSerializer

    def get_queryset(self):
        return _filtrer(A.objects.filter(owner=self.request.user), self.request.query_params)

    def perform_create(self, serializer):
        analyse = serializer.save()
        lancer_traitement(analyse.id)

    @action(detail=True, methods=["post"])
    def reanalyser(self, request, pk=None):
        analyse = self.get_object()
        _relancer(analyse)
        return Response(AnalyseSerializer(analyse, context={"request": request}).data)


# ── API administrateur : TOUTES les analyses ───────────────────────────────
class AdminAnalyseViewSet(SuppressionAvecFichiers, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                          mixins.DestroyModelMixin, viewsets.GenericViewSet):
    permission_classes = [EstAdmin]

    def get_serializer_class(self):
        return AdminAnalyseDetailSerializer if self.action == "retrieve" else AdminAnalyseSerializer

    def get_queryset(self):
        qs = _filtrer(A.objects.select_related("owner"), self.request.query_params)
        recherche = self.request.query_params.get("search")
        if recherche:
            qs = qs.filter(Q(owner__email__icontains=recherche)
                           | Q(owner__first_name__icontains=recherche)
                           | Q(owner__last_name__icontains=recherche)
                           | Q(nom_original__icontains=recherche))
        return qs

    @action(detail=True, methods=["post"])
    def reanalyser(self, request, pk=None):
        analyse = self.get_object()
        _relancer(analyse)
        return Response(AdminAnalyseSerializer(analyse, context={"request": request}).data)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        qs = A.objects.all()
        termines = qs.filter(statut=A.Statut.TERMINE)
        par_verdict = {l["verdict"]: l["n"] for l in termines.values("verdict").annotate(n=Count("id"))}
        suspects = par_verdict.get("suspect", 0) + par_verdict.get("retouche", 0)
        nb_termines = termines.count()
        return Response({
            "total": qs.count(),
            "photos": qs.filter(type=A.Type.PHOTO).count(),
            "videos": qs.filter(type=A.Type.VIDEO).count(),
            "par_verdict": par_verdict,
            "suspects": suspects,
            "taux_suspects": round(100 * suspects / nb_termines, 1) if nb_termines else 0,
            "score_moyen": round(termines.aggregate(m=Avg("score"))["m"] or 0, 1),
            "en_cours": qs.filter(statut__in=[A.Statut.EN_ATTENTE, A.Statut.EN_COURS]).count(),
        })