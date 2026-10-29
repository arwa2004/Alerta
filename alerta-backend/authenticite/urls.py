from rest_framework.routers import DefaultRouter

from .views import AdminAnalyseViewSet, AnalyseViewSet

router = DefaultRouter()
router.register("admin", AdminAnalyseViewSet, basename="authenticite-admin")   # AVANT la route vide
router.register("", AnalyseViewSet, basename="authenticite")
urlpatterns = router.urls