from PIL import Image
from PIL.ExifTags import TAGS

LOGICIELS = ("photoshop", "gimp", "lightroom", "snapseed", "canva", "affinity",
             "pixlr", "paint.net", "picsart", "facetune")


def analyser_exif(chemin):
    try:
        img = Image.open(chemin)
        brut = img.getexif()
        exif = {TAGS.get(k, k): v for k, v in brut.items()} if brut else {}
        sous = brut.get_ifd(0x8769) if brut else {}          # sous-bloc EXIF (date de prise de vue)
    except Exception:
        return {"score": None, "indices": ["Métadonnées illisibles"]}

    indices, score = [], 0

    if not exif:
        indices.append("Aucune métadonnée EXIF (supprimées, capture d'écran, image générée ou envoyée par messagerie)")
        score += 35

    logiciel = str(exif.get("Software", "")).strip()
    edition = any(nom in logiciel.lower() for nom in LOGICIELS)
    if edition:
        indices.append(f"Logiciel d'édition détecté : {logiciel}")
        score += 85
    elif logiciel:
        indices.append(f"Logiciel indiqué : {logiciel}")

    date_modif, date_prise = exif.get("DateTime"), sous.get(0x9003)
    if date_modif and date_prise and date_modif != date_prise:
        indices.append(f"Date de modification ({date_modif}) différente de la date de prise de vue ({date_prise})")
        score += 25

    if not indices:
        indices.append("Métadonnées cohérentes, aucun signe d'édition")
    return {"score": min(score, 100), "indices": indices, "logiciel_edition": edition}