from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import FaceImageView, KnownPersonViewSet, SurveillanceVideoViewSet, ZoneViewSet

router = DefaultRouter()
router.register('zones', ZoneViewSet, basename='zone')
router.register('persons', KnownPersonViewSet, basename='person')
router.register('videos', SurveillanceVideoViewSet, basename='video')

urlpatterns = [
    path('faces/<int:pk>/image/', FaceImageView.as_view(), name='face_image'),
    path('', include(router.urls)),
]
