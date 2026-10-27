from django.urls import path

from .views import (
    # Existing
    FloorPlanDetailView,
    FloorPlanImageView,
    ProjectDetailView,
    ProjectFloorPlanListCreateView,
    ProjectListCreateView,
    # Phase 2
    AnalyseFloorPlanView,
    FloorPlanAnalysisDetailView,
    OptimizeCamerasView,
    OptimizationListView,
    OptimizationDetailView,
)

urlpatterns = [
    # --- existing ---
    path('projects/',
         ProjectListCreateView.as_view(),
         name='planner_project_list'),
    path('projects/<int:pk>/',
         ProjectDetailView.as_view(),
         name='planner_project_detail'),
    path('projects/<int:project_id>/floor-plans/',
         ProjectFloorPlanListCreateView.as_view(),
         name='planner_floorplan_list'),
    path('floor-plans/<int:pk>/',
         FloorPlanDetailView.as_view(),
         name='planner_floorplan_detail'),
    path('floor-plans/<int:pk>/image/',
         FloorPlanImageView.as_view(),
         name='planner_floorplan_image'),

    # --- phase 2: analysis ---
    path('floor-plans/<int:floor_plan_id>/analyze/',
         AnalyseFloorPlanView.as_view(),
         name='floor-plan-analyze'),
    path('floor-plans/<int:floor_plan_id>/analysis/',
         FloorPlanAnalysisDetailView.as_view(),
         name='floor-plan-analysis'),

    # --- phase 2: optimization ---
    path('projects/<int:project_id>/optimize/',
         OptimizeCamerasView.as_view(),
         name='project-optimize'),
    path('projects/<int:project_id>/optimizations/',
         OptimizationListView.as_view(),
         name='project-optimizations'),
    path('optimizations/<int:optimization_id>/',
         OptimizationDetailView.as_view(),
         name='optimization-detail'),
]