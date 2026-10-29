import shutil

from django.conf import settings

from .copy_move import analyser_copy_move
from .detecteur_ia import analyser_ia
from .ela import analyser_ela
from .exif import analyser_exif
from .video import extraire_images

POIDS = {"exif": 0.15, "ela": 0.25, "copy_move": 0.20, "ia": 0.40}


def verdict_pour(score):
    if score < 30:
        return "authentique"
    if score < 60:
        return "suspect"
    return "retouche"


def calculer_score(techniques):
    """Moyenne pondérée sur les techniques disponibles + règle du signal fort."""
    dispo = {k: t["score"] for k, t in techniques.items() if t.get("score") is not None}
    if not dispo:
        return 0.0
    total = sum(POIDS[k] for k in dispo)
    score = sum(POIDS[k] * s for k, s in dispo.items()) / total
    fort = max(dispo.values())
    if fort >= 80:                      # une preuve directe (ex. Photoshop) ne doit pas être diluée
        score = max(score, 0.8 * fort)
    return round(min(score, 100.0), 1)


def analyser_image(chemin, avec_exif=True):
    exif = analyser_exif(chemin) if avec_exif else {"score": None, "indices": []}
    ela = analyser_ela(chemin)
    carte = ela.pop("carte", None)
    techniques = {
        "exif": exif,
        "ela": ela,
        "copy_move": analyser_copy_move(chemin),
        "ia": analyser_ia(chemin),
    }
    return techniques, carte


def analyser_video(chemin):
    nombre = getattr(settings, "AUTH_NB_IMAGES_VIDEO", 12)
    dossier, images = extraire_images(chemin, nombre)
    resultats, par_image = [], []
    try:
        for seconde, img in images:
            techniques, carte = analyser_image(img, avec_exif=False)
            score = calculer_score(techniques)
            resultats.append((score, techniques, carte))
            par_image.append({"temps": seconde, "score": score})
    finally:
        shutil.rmtree(dossier, ignore_errors=True)

    # Agrégation par technique : moitié moyenne, moitié maximum
    agreges = {}
    for nom in POIDS:
        valeurs = [r[1][nom]["score"] for r in resultats if r[1][nom].get("score") is not None]
        if not valeurs:
            agreges[nom] = {"score": None, "indices": ["Non applicable à la vidéo"]}
            continue
        pire = max(resultats, key=lambda r: r[1][nom].get("score") or -1)
        agreges[nom] = {
            "score": round(0.5 * sum(valeurs) / len(valeurs) + 0.5 * max(valeurs), 1),
            "indices": pire[1][nom]["indices"],
        }

    carte = max(resultats, key=lambda r: r[0])[2]     # carte ELA de l'image la plus suspecte
    return agreges, carte, par_image


def analyser_media(analyse):
    chemin = analyse.fichier.path
    if analyse.type == "photo":
        techniques, carte = analyser_image(chemin)
        details = {"techniques": techniques}
    else:
        techniques, carte, par_image = analyser_video(chemin)
        details = {"techniques": techniques, "images": par_image}

    score = calculer_score(techniques)
    details["poids"] = POIDS
    return {"score": score, "verdict": verdict_pour(score), "details": details, "carte": carte}