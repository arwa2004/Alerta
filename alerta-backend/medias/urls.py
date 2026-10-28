from rest_framework.routers import DefaultRouter

from .views import AdminMediaViewSet, MediaViewSet

router = DefaultRouter()
router.register("admin", AdminMediaViewSet, basename="media-admin")   # AVANT la route vide
router.register("", MediaViewSet, basename="media")
urlpatterns = router.urls