from django.http import FileResponse
from rest_framework import generics, parsers, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from .models import FloorPlan, Project
from .serializers import (
    FloorPlanSerializer, FloorPlanUploadSerializer, ProjectSerializer,
)

# Autorisation : un utilisateur ne voit/modifie que SES projets (404 sinon, pour ne pas
# révéler l'existence d'un projet). Les plans d'étage sont privés, y compris pour les admins.


class ProjectListCreateView(generics.ListCreateAPIView):
    serializer_class = ProjectSerializer

    def get_queryset(self):
        return Project.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ProjectDetailView(generics.RetrieveAPIView):
    serializer_class = ProjectSerializer

    def get_queryset(self):
        return Project.objects.filter(owner=self.request.user)


class ProjectFloorPlanListCreateView(generics.GenericAPIView):
    """GET : liste des plans du projet. POST (multipart) : upload d'un PDF."""
    parser_classes = [parsers.MultiPartParser, parsers.FormParser]

    def get_project(self):
        try:
            return Project.objects.get(pk=self.kwargs['project_id'], owner=self.request.user)
        except Project.DoesNotExist:
            raise NotFound()

    def get(self, request, project_id):
        project = self.get_project()
        serializer = FloorPlanSerializer(
            project.floor_plans.all(), many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request, project_id):
        project = self.get_project()
        upload = FloorPlanUploadSerializer(data=request.data, context={'project': project})
        upload.is_valid(raise_exception=True)
        plan = upload.save()
        return Response(
            FloorPlanSerializer(plan, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class FloorPlanDetailView(generics.RetrieveAPIView):
    serializer_class = FloorPlanSerializer

    def get_queryset(self):
        return FloorPlan.objects.filter(project__owner=self.request.user)


class FloorPlanImageView(generics.GenericAPIView):
    """Image PNG rendue, servie uniquement au propriétaire."""

    def get_queryset(self):
        return FloorPlan.objects.filter(project__owner=self.request.user)

    def get(self, request, pk):
        plan = self.get_object()
        response = FileResponse(plan.image_file.open('rb'), content_type='image/png')
        response['Cache-Control'] = 'private, max-age=0, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        return response
