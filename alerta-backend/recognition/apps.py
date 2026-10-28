from django.apps import AppConfig


class RecognitionConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'recognition'
    verbose_name = 'Zones et reconnaissance faciale'

    def ready(self):
        from . import signals  # noqa: F401
