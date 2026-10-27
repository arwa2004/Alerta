from django.core.files.base import ContentFile
from rest_framework import serializers

from .models import FloorPlan, Project
from .pdf_utils import PDFValidationError, read_and_validate_pdf, render_page_to_png


class ProjectSerializer(serializers.ModelSerializer):
    floor_plan_count = serializers.IntegerField(source='floor_plans.count', read_only=True)

    class Meta:
        model = Project
        fields = ['id', 'name', 'budget', 'currency', 'floor_plan_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Le nom du projet est obligatoire.")
        return value


class FloorPlanSerializer(serializers.ModelSerializer):
    """Métadonnées (lecture seule). Aucun chemin disque n'est exposé."""
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = FloorPlan
        fields = [
            'id', 'project', 'original_filename', 'file_size', 'sha256', 'page_count',
            'selected_page', 'image_width', 'image_height', 'render_dpi', 'image_url',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_image_url(self, obj):
        request = self.context.get('request')
        path = f"/api/planner/floor-plans/{obj.pk}/image/"
        return request.build_absolute_uri(path) if request else path


class FloorPlanUploadSerializer(serializers.Serializer):
    file = serializers.FileField(allow_empty_file=True)
    page = serializers.IntegerField(min_value=1, default=1, required=False)

    def create(self, validated_data):
        project = self.context['project']
        upload = validated_data['file']
        page = validated_data.get('page', 1)
        try:
            data, digest, page_count = read_and_validate_pdf(upload)
            if page > page_count:
                raise PDFValidationError(f"Page invalide : le PDF contient {page_count} page(s).")
            rendered = render_page_to_png(data, page)
        except PDFValidationError as exc:
            raise serializers.ValidationError({'file': [str(exc)]})

        original = (upload.name or 'plan.pdf').replace('\\', '/').split('/')[-1][:255]
        plan = FloorPlan(
            project=project,
            original_filename=original,
            file_size=len(data),
            sha256=digest,
            page_count=page_count,
            selected_page=page,
            image_width=rendered.width,
            image_height=rendered.height,
            render_dpi=rendered.dpi,
        )
        plan.pdf_file.save('plan.pdf', ContentFile(data), save=False)
        plan.image_file.save('plan.png', ContentFile(rendered.png_bytes), save=False)
        try:
            plan.save()
        except Exception:
            plan.pdf_file.delete(save=False)
            plan.image_file.delete(save=False)
            raise
        return plan
from decimal import Decimal, InvalidOperation
from .models import FloorPlanAnalysis, CameraOptimization


class FloorPlanAnalysisSerializer(serializers.ModelSerializer):
    class Meta:
        model = FloorPlanAnalysis
        fields = ["id", "floor_plan", "result_json", "confidence",
                  "warnings", "created_at", "updated_at"]
        read_only_fields = ["id", "result_json", "confidence",
                            "warnings", "created_at", "updated_at"]


class CameraOptimizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = CameraOptimization
        fields = ["id", "project", "budget", "camera_config",
                  "result_json", "created_at"]
        read_only_fields = ["id", "result_json", "created_at"]


class OptimizationRequestSerializer(serializers.Serializer):
    budget = serializers.CharField()
    camera_config = serializers.DictField(required=False, default=dict)

    def validate_budget(self, value):
        try:
            b = Decimal(str(value))
        except (InvalidOperation, TypeError):
            raise serializers.ValidationError("Budget must be a number.")
        if b <= 0:
            raise serializers.ValidationError("Budget must be greater than zero.")
        if b > Decimal("10000000"):
            raise serializers.ValidationError("Budget is unrealistically large.")
        return b

    def validate_camera_config(self, cfg):
        def pos(name, default=None):
            v = cfg.get(name, default)
            if v is None: return
            try: fv = float(v)
            except (TypeError, ValueError):
                raise serializers.ValidationError(f"{name} must be a number.")
            if fv <= 0:
                raise serializers.ValidationError(f"{name} must be positive.")
            cfg[name] = fv
        pos("price", 120.0)
        pos("fov_deg", 90.0)
        pos("max_range_px", 400.0)
        if cfg["fov_deg"] > 360:
            raise serializers.ValidationError("fov_deg must be <= 360.")
        return cfg
