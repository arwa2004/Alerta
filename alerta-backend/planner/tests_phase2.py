import os
import tempfile

import cv2
import numpy as np
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import (Project, FloorPlan, FloorPlanAnalysis,
                     CameraOptimization)
from .services.floorplan_analysis import analyse_floor_plan
from .services.cctv_optimizer import optimize_cameras
from .services.geometry import segment_blocked

User = get_user_model()


def _write_floorplan(path, w=500, h=500, t=6):
    img = np.full((h, w), 255, dtype=np.uint8)
    cv2.rectangle(img, (40, 40), (w - 40, h - 40), 0, t)
    cv2.imwrite(path, img)


class AnalysisTests(TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        _write_floorplan(self.tmp.name)

    def tearDown(self):
        os.unlink(self.tmp.name)

    def test_detects_walls_and_room(self):
        res = analyse_floor_plan(self.tmp.name)
        self.assertGreater(len(res["walls"]), 0)
        self.assertGreater(len(res["rooms"]), 0)

    def test_unreadable_raises(self):
        with self.assertRaises(ValueError):
            analyse_floor_plan("/nonexistent.png")


class GeometryTests(TestCase):
    def test_wall_occlusion(self):
        walls = [{"x1": 50, "y1": 0, "x2": 50, "y2": 100}]
        self.assertTrue(segment_blocked((10, 50), (90, 50), walls))
        self.assertFalse(segment_blocked((10, 50), (40, 50), walls))


class OptimizerTests(TestCase):
    def _analysis(self):
        return {
            "image_width": 300, "image_height": 300,
            "walls": [
                {"x1": 10, "y1": 10, "x2": 290, "y2": 10},
                {"x1": 290, "y1": 10, "x2": 290, "y2": 290},
                {"x1": 290, "y1": 290, "x2": 10, "y2": 290},
                {"x1": 10, "y1": 290, "x2": 10, "y2": 10},
            ],
            "rooms": [{"polygon": [[20, 20], [280, 20], [280, 280], [20, 280]]}],
            "corridors": [],
            "entrances": [{"x": 150, "y": 20, "confidence": 0.5}],
            "warnings": [],
        }

    def test_budget_enforced(self):
        res = optimize_cameras(self._analysis(), 100,
                               {"price": 60.0, "fov_deg": 90.0,
                                "max_range_px": 400})
        self.assertEqual(res["total_cameras"], 1)
        self.assertLessEqual(res["total_cost"], 100)

    def test_insufficient_budget(self):
        res = optimize_cameras(self._analysis(), 10,
                               {"price": 60.0, "fov_deg": 90.0,
                                "max_range_px": 400})
        self.assertEqual(res["total_cameras"], 0)
        self.assertEqual(res["total_cost"], 0)

    def test_invalid_inputs(self):
        with self.assertRaises(ValueError):
            optimize_cameras(self._analysis(), 100,
                             {"price": -1, "fov_deg": 90, "max_range_px": 400})
        with self.assertRaises(ValueError):
            optimize_cameras(self._analysis(), 100,
                             {"price": 60, "fov_deg": 0, "max_range_px": 400})
        with self.assertRaises(ValueError):
            optimize_cameras(self._analysis(), 0)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class ApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="u1", password="p")
        self.other = User.objects.create_user(username="u2", password="p")
        self.project = Project.objects.create(user=self.user, name="P1")
        path = os.path.join(tempfile.mkdtemp(), "plan.png")
        _write_floorplan(path)
        from django.core.files.base import ContentFile
        self.fp = FloorPlan.objects.create(project=self.project)
        with open(path, "rb") as f:
            self.fp.image.save("plan.png", ContentFile(f.read()), save=True)

    def test_unauthenticated_rejected(self):
        r = self.client.post(f"/api/planner/floor-plans/{self.fp.id}/analyze/")
        self.assertIn(r.status_code, (401, 403))

    def test_other_user_rejected(self):
        self.client.force_authenticate(self.other)
        r = self.client.post(f"/api/planner/floor-plans/{self.fp.id}/analyze/")
        self.assertEqual(r.status_code, 404)

    def test_roundtrip(self):
        self.client.force_authenticate(self.user)
        r = self.client.post(f"/api/planner/floor-plans/{self.fp.id}/analyze/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(FloorPlanAnalysis.objects.filter(floor_plan=self.fp).exists())
        r = self.client.post(f"/api/planner/projects/{self.project.id}/optimize/",
                             {"budget": "1000",
                              "camera_config": {"price": 200}},
                             format="json")
        self.assertEqual(r.status_code, 201)
        self.assertTrue(CameraOptimization.objects.filter(project=self.project).exists())

    def test_invalid_budget_rejected(self):
        self.client.force_authenticate(self.user)
        r = self.client.post(f"/api/planner/projects/{self.project.id}/optimize/",
                             {"budget": "-5"}, format="json")
        self.assertEqual(r.status_code, 400)
