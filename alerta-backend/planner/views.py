import os
import traceback  # <--- ADDED FOR DEBUGGING
from django.http import FileResponse
from rest_framework import generics, parsers, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from .models import (
    FloorPlan, Project, FloorPlanAnalysis, CameraOptimization
)
from .serializers import (
    FloorPlanSerializer, FloorPlanUploadSerializer, ProjectSerializer,
    FloorPlanAnalysisSerializer, CameraOptimizationSerializer, OptimizationRequestSerializer
)
from .services.floorplan_analysis import analyse_floor_plan
from .services.cctv_optimizer import optimize_cameras


# ==============================================================================
# EXISTING VIEWS (Phase 1)
# ==============================================================================

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


# ==============================================================================
# PHASE 2 VIEWS (Analysis & Optimization)
# ==============================================================================

def _owned_floor_plan(request, fp_id):
    fp = FloorPlan.objects.select_related("project").filter(pk=fp_id).first()
    if fp is None or fp.project.owner_id != request.user.id:
        return None
    return fp


def _image_path(fp):
    img = getattr(fp, "image_file", None)
    if not img:
        return None
    p = getattr(img, "path", img)
    return p if p and os.path.exists(p) else None


class AnalyseFloorPlanView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, floor_plan_id):
        fp = _owned_floor_plan(request, floor_plan_id)
        if fp is None:
            return Response({"detail": "Not found."},
                            status=status.HTTP_404_NOT_FOUND)
        
        path = _image_path(fp)
        if path is None:
            return Response({"detail": "Floor plan image missing or unconverted."},
                            status=status.HTTP_400_BAD_REQUEST)
        
        try:
            result = analyse_floor_plan(path)
        except ValueError as e:
            return Response({"detail": str(e)},
                            status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # ADDED: This will print the exact error to your Django terminal
            traceback.print_exc()
            return Response({"detail": f"Analysis failed: {str(e)}"},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        obj, _ = FloorPlanAnalysis.objects.update_or_create(
            floor_plan=fp,
            defaults={"result_json": result,
                      "confidence": result.get("confidence", 0.0),
                      "warnings": result.get("warnings", [])})
        return Response(FloorPlanAnalysisSerializer(obj).data)


class FloorPlanAnalysisDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, floor_plan_id):
        fp = _owned_floor_plan(request, floor_plan_id)
        if fp is None:
            return Response({"detail": "Not found."},
                            status=status.HTTP_404_NOT_FOUND)
        try:
            a = fp.analysis
        except FloorPlanAnalysis.DoesNotExist:
            return Response({"detail": "No analysis yet."},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(FloorPlanAnalysisSerializer(a).data)


class OptimizeCamerasView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id):
        project = Project.objects.filter(pk=project_id, owner=request.user).first()
        if project is None:
            return Response({"detail": "Not found."},
                            status=status.HTTP_404_NOT_FOUND)
        
        s = OptimizationRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        budget = s.validated_data["budget"]
        cfg = s.validated_data.get("camera_config", {})
        
        fp = FloorPlan.objects.filter(project=project).first()
        if fp is None:
            return Response({"detail": "Project has no floor plan."},
                            status=status.HTTP_400_BAD_REQUEST)
        
        try:
            a = fp.analysis
        except FloorPlanAnalysis.DoesNotExist:
            return Response({"detail": "Run analysis first."},
                            status=status.HTTP_400_BAD_REQUEST)
        
        try:
            result = optimize_cameras(a.result_json, budget, cfg)
        except ValueError as e:
            return Response({"detail": str(e)},
                            status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # ADDED: This will print the exact error to your Django terminal
            traceback.print_exc()
            return Response({"detail": f"Optimization failed: {str(e)}"},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        obj = CameraOptimization.objects.create(
            project=project, budget=budget, camera_config=cfg,
            result_json=result)
        return Response(CameraOptimizationSerializer(obj).data,
                        status=status.HTTP_201_CREATED)


class OptimizationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, project_id):
        project = Project.objects.filter(pk=project_id, owner=request.user).first()
        if project is None:
            return Response({"detail": "Not found."},
                            status=status.HTTP_404_NOT_FOUND)
        qs = project.optimizations.all()
        return Response(CameraOptimizationSerializer(qs, many=True).data)


class OptimizationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, optimization_id):
        opt = CameraOptimization.objects.select_related("project").filter(pk=optimization_id).first()
        if opt is None or opt.project.owner_id != request.user.id:
            return Response({"detail": "Not found."},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(CameraOptimizationSerializer(opt).data)