import os
import traceback
from django.http import FileResponse
from rest_framework import generics, parsers, status
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

# Imports des services
from .services.digital_twin import simulate_custom_cameras
from .services.floorplan_analysis import analyse_floor_plan, recommend_cameras
from .services.security_auditor import audit_floor_plan

# Imports des modèles et serializers
from .models import (
    FloorPlan, Project, FloorPlanAnalysis, CameraOptimization
)
from .serializers import (
    FloorPlanSerializer, FloorPlanUploadSerializer, ProjectSerializer,
    FloorPlanAnalysisSerializer, CameraOptimizationSerializer,
    OptimizationRequestSerializer,
)

MAX_CAMERAS_FOR_PLAN   = 20
DEFAULT_CAMERA_PRICE   = 120.0
DEFAULT_FOV_DEG        = 90.0
DEFAULT_RANGE_FRAC     = 0.9
DEFAULT_TARGET_COVER   = 0.93
DEFAULT_MIN_ROOM_FRAC  = 0.03


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
    """
    Budget-constrained CCTV placement using the ray-cast / greedy set-cover
    planner in `floorplan_analysis.recommend_cameras`.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, project_id):
        project = Project.objects.filter(pk=project_id, owner=request.user).first()
        if project is None:
            return Response({"detail": "Not found."},
                            status=status.HTTP_404_NOT_FOUND)

        s = OptimizationRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        budget = float(s.validated_data["budget"])
        cfg = s.validated_data.get("camera_config") or {}

        fp = FloorPlan.objects.filter(project=project).first()
        if fp is None:
            return Response({"detail": "Project has no floor plan."},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            analysis = fp.analysis
        except FloorPlanAnalysis.DoesNotExist:
            return Response({"detail": "Run analysis first."},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            price         = float(cfg.get("price", DEFAULT_CAMERA_PRICE))
            fov_deg       = float(cfg.get("fov_deg", DEFAULT_FOV_DEG))
            range_frac    = float(cfg.get("range_frac", DEFAULT_RANGE_FRAC))
            target_cover  = float(cfg.get("target_coverage", DEFAULT_TARGET_COVER))
            min_room_frac = float(cfg.get("min_room_frac", DEFAULT_MIN_ROOM_FRAC))
            exclude_ids   = tuple(int(x) for x in (cfg.get("exclude_room_ids") or ()))
            plan_width_m  = cfg.get("plan_width_m")
            if plan_width_m is not None:
                plan_width_m = float(plan_width_m)
        except (TypeError, ValueError) as e:
            return Response({"detail": f"Invalid camera_config: {e}"},
                            status=status.HTTP_400_BAD_REQUEST)

        if price <= 0:
            return Response({"detail": "Camera price must be positive."},
                            status=status.HTTP_400_BAD_REQUEST)
        if not (0 < fov_deg <= 360):
            return Response({"detail": "fov_deg must be in (0, 360]."},
                            status=status.HTTP_400_BAD_REQUEST)
        if range_frac <= 0:
            return Response({"detail": "range_frac must be positive."},
                            status=status.HTTP_400_BAD_REQUEST)
        if not (0 < target_cover <= 1):
            return Response({"detail": "target_coverage must be in (0, 1]."},
                            status=status.HTTP_400_BAD_REQUEST)
        if not (0 <= min_room_frac <= 1):
            return Response({"detail": "min_room_frac must be in [0, 1]."},
                            status=status.HTTP_400_BAD_REQUEST)

        max_cams = min(MAX_CAMERAS_FOR_PLAN, int(budget // price))
        if max_cams <= 0:
            empty = {
                "cameras": [],
                "coverage_pct": 0.0,
                "room_coverage": {},
                "optional_room_ids": [],
                "overlay_b64": None,
                "total_cost": 0.0,
                "remaining_budget": round(budget, 2),
                "warnings": ["Budget is below the cost of a single camera."],
                "camera_config_used": cfg,
            }
            obj = CameraOptimization.objects.create(
                project=project, budget=budget, camera_config=cfg,
                result_json=empty)
            return Response(CameraOptimizationSerializer(obj).data,
                            status=status.HTTP_201_CREATED)

        try:
            result = recommend_cameras(
                analysis.result_json,
                fov_deg=fov_deg,
                range_frac=range_frac,
                max_cameras=max_cams,
                target_coverage=target_cover,
                min_room_frac=min_room_frac,
                exclude_room_ids=exclude_ids,
                plan_width_m=plan_width_m,
            )
        except ValueError as e:
            return Response({"detail": str(e)},
                            status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            traceback.print_exc()
            return Response({"detail": f"Optimization failed: {str(e)}"},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        result["total_cost"]       = round(price * len(result["cameras"]), 2)
        result["remaining_budget"] = round(budget - result["total_cost"], 2)
        result["camera_config_used"] = {
            "price": price,
            "fov_deg": fov_deg,
            "range_frac": range_frac,
            "target_coverage": target_cover,
            "min_room_frac": min_room_frac,
            "exclude_room_ids": list(exclude_ids),
            "plan_width_m": plan_width_m,
        }

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
        opt = CameraOptimization.objects.select_related("project").filter(
            pk=optimization_id).first()
        if opt is None or opt.project.owner_id != request.user.id:
            return Response({"detail": "Not found."},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(CameraOptimizationSerializer(opt).data)


class DigitalTwinSimulateView(APIView):
    """
    Endpoint pour le jumeau numérique. 
    Reçoit les caméras déplacées par l'utilisateur et renvoie leurs zones de vision.
    """
    def post(self, request):
        data = request.data
        cleaned_image_b64 = data.get('cleaned_image_b64')
        custom_cameras = data.get('cameras', [])
        image_width = data.get('image_width', 1600)

        if not cleaned_image_b64:
            return Response({"error": "Missing floor plan image data"}, status=status.HTTP_400_BAD_REQUEST)

        result = simulate_custom_cameras(cleaned_image_b64, custom_cameras, image_width)
        return Response(result, status=status.HTTP_200_OK)


# ==============================================================================
# NOUVEAU : AUDITEUR DE RISQUES DE SÉCURITÉ (AI Security Risk Auditor)
# ==============================================================================
class SecurityAuditView(APIView):
    """
    Endpoint pour générer l'audit de sécurité (Security Risk Auditor).
    Reçoit un floor_plan_id et renvoie le rapport de risque complet.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, floor_plan_id):
        # 1. Vérifier que le plan appartient bien à l'utilisateur
        fp = _owned_floor_plan(request, floor_plan_id)
        if fp is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        # 2. Récupérer le chemin physique de l'image
        path = _image_path(fp)
        if path is None:
            return Response({"detail": "Floor plan image missing or unconverted."},
                            status=status.HTTP_400_BAD_REQUEST)

        # Optionnel : récupérer la largeur réelle du plan (en mètres) envoyée par le frontend
        plan_width_m = request.data.get('plan_width_m', None)
        if plan_width_m is not None:
            try:
                plan_width_m = float(plan_width_m)
            except ValueError:
                plan_width_m = None

        try:
            # 3. Lancer l'analyse de base (OpenCV) pour avoir les pièces et les murs
            analysis_result = analyse_floor_plan(path)
            
            # 4. Lancer l'audit de sécurité (qui utilise l'analyse précédente)
            audit_report = audit_floor_plan(
                result=analysis_result, 
                image_path=path, 
                plan_width_m=plan_width_m
            )
            
            # 5. Renvoyer le rapport complet (scores, risques, overlay_b64...)
            return Response(audit_report, status=status.HTTP_200_OK)

        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            traceback.print_exc()
            return Response({"detail": f"Audit failed: {str(e)}"},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)