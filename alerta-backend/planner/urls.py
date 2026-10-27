from django.urls import path

from .views import (
    FloorPlanDetailView, FloorPlanImageView, ProjectDetailView,
    ProjectFloorPlanListCreateView, ProjectListCreateView,
)

urlpatterns = [
    path('projects/', ProjectListCreateView.as_view(), name='planner_project_list'),
    path('projects/<int:pk>/', ProjectDetailView.as_view(), name='planner_project_detail'),
    path('projects/<int:project_id>/floor-plans/', ProjectFloorPlanListCreateView.as_view(),
         name='planner_floorplan_list'),
    path('floor-plans/<int:pk>/', FloorPlanDetailView.as_view(), name='planner_floorplan_detail'),
    path('floor-plans/<int:pk>/image/', FloorPlanImageView.as_view(), name='planner_floorplan_image'),
]
