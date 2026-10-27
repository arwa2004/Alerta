import os

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.utils.deconstruct import deconstructible


@deconstructible
class PrivateMediaStorage(FileSystemStorage):
    """
    Stockage privé : dossier PRIVATE_MEDIA_ROOT (hors de MEDIA_ROOT), sans URL publique.
    Les fichiers ne sont servis que par des vues authentifiées.
    Le chemin est lu dynamiquement dans les settings (utile pour les tests).
    """

    @property
    def base_location(self):
        return str(settings.PRIVATE_MEDIA_ROOT)

    @property
    def location(self):
        return os.path.abspath(self.base_location)

    def url(self, name):
        raise ValueError("Les fichiers du planificateur sont privés (aucune URL publique).")
