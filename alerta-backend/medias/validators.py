import os

from django.core.exceptions import ValidationError
from PIL import Image

EXT_PHOTO = {".jpg", ".jpeg", ".png"}
EXT_VIDEO = {".mp4", ".avi", ".mov", ".mkv"}
MAX_PHOTO = 10 * 1024 * 1024      # 10 Mo
MAX_VIDEO = 200 * 1024 * 1024     # 200 Mo


def valider_fichier(fichier):
    """Vérifie format, taille et intégrité. Retourne 'photo' ou 'video'."""
    extension = os.path.splitext(fichier.name)[1].lower()
    if extension in EXT_PHOTO:
        type_media, maximum = "photo", MAX_PHOTO
    elif extension in EXT_VIDEO:
        type_media, maximum = "video", MAX_VIDEO
    else:
        raise ValidationError("Format non supporté. Utilisez JPG, PNG, MP4, AVI, MOV ou MKV.")

    if fichier.size > maximum:
        raise ValidationError(f"Fichier trop volumineux (maximum {maximum // (1024 * 1024)} Mo).")

    if type_media == "photo":
        try:
            Image.open(fichier).verify()
        except Exception:
            raise ValidationError("Image corrompue ou illisible.")
        finally:
            fichier.seek(0)

    return type_media