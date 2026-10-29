"""Évaluation de la qualité d'une image ou d'une vidéo (OpenCV).

Mesures : netteté (variance du Laplacien), luminosité, contraste, résolution,
et taille des visages détectés. Produit un score /100, des problèmes et des conseils.
"""
import cv2
import numpy as np

# ── Seuils ──────────────────────────────────────────────────────────────────────
FLOU_HAUT, FLOU_MOYEN = 40, 100            # variance du Laplacien (image réduite à 640 px)
SOMBRE_HAUT, SOMBRE_MOYEN = 50, 80         # luminosité moyenne (0-255)
CLAIR_HAUT, CLAIR_MOYEN = 215, 190
CONTRASTE_HAUT, CONTRASTE_MOYEN = 12, 25   # écart-type des niveaux de gris
RES_HAUT, RES_MOYEN = 360, 480             # plus petit côté, en pixels
VISAGE_MIN = 60                            # taille minimale d'un visage fiable, en pixels
NB_IMAGES_VIDEO = 12


def _lire_image(chemin):
    # np.fromfile + imdecode : fonctionne même avec des accents dans le chemin (Windows)
    image = cv2.imdecode(np.fromfile(chemin, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Image illisible.")
    return image


def _mesurer(image):
    hauteur, largeur = image.shape[:2]
    gris = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    # On réduit les grandes images pour que la netteté ne dépende pas de la résolution
    if largeur > 640:
        gris_n = cv2.resize(gris, (640, max(1, int(hauteur * 640 / largeur))), interpolation=cv2.INTER_AREA)
    else:
        gris_n = gris
    return {
        "nettete": float(cv2.Laplacian(gris_n, cv2.CV_64F).var()),
        "luminosite": float(gris.mean()),
        "contraste": float(gris.std()),
        "surexposition": float((gris > 245).mean()),
        "largeur": int(largeur),
        "hauteur": int(hauteur),
    }


def _mediane(mesures, cle):
    return float(np.median([m[cle] for m in mesures]))


def _borner(valeur):
    return float(max(0.0, min(100.0, valeur)))


def _scores(m):
    nettete = _borner(m["nettete"] / 200 * 100)
    lum = m["luminosite"]
    if lum < 90:
        luminosite = _borner((lum - 20) / 70 * 100)
    elif lum > 170:
        luminosite = _borner((245 - lum) / 75 * 100)
    else:
        luminosite = 100.0
    contraste = _borner((m["contraste"] - 10) / 35 * 100)
    petit_cote = min(m["largeur"], m["hauteur"])
    resolution = _borner((petit_cote - 240) / (720 - 240) * 100)
    return {"nettete": round(nettete), "luminosite": round(luminosite),
            "contraste": round(contraste), "resolution": round(resolution)}


def _problemes(m):
    liste = []

    def ajouter(code, gravite, conseil):
        liste.append({"code": code, "gravite": gravite, "conseil": conseil})

    if m["nettete"] < FLOU_HAUT:
        ajouter("flou", "haute", "Image très floue : stabilisez la caméra, nettoyez l'objectif et vérifiez la mise au point.")
    elif m["nettete"] < FLOU_MOYEN:
        ajouter("flou", "moyenne", "Image légèrement floue : vérifiez la mise au point et la propreté de l'objectif.")

    if m["luminosite"] < SOMBRE_HAUT:
        ajouter("sombre", "haute", "Image trop sombre : améliorez l'éclairage ou activez la vision nocturne.")
    elif m["luminosite"] < SOMBRE_MOYEN:
        ajouter("sombre", "moyenne", "Image un peu sombre : ajoutez de la lumière dans la zone surveillée.")
    elif m["luminosite"] > CLAIR_HAUT:
        ajouter("surexposee", "haute", "Image surexposée : évitez le contre-jour et réduisez l'exposition de la caméra.")
    elif m["luminosite"] > CLAIR_MOYEN or m["surexposition"] > 0.25:
        ajouter("surexposee", "moyenne", "Zones trop lumineuses : évitez le contre-jour et les sources de lumière directes.")

    if m["contraste"] < CONTRASTE_HAUT:
        ajouter("contraste", "haute", "Contraste très faible : l'image est délavée ou brumeuse, ajustez l'éclairage.")
    elif m["contraste"] < CONTRASTE_MOYEN:
        ajouter("contraste", "moyenne", "Contraste faible : l'éclairage est trop uniforme, ajustez-le.")

    petit_cote = min(m["largeur"], m["hauteur"])
    taille = f"{m['largeur']}×{m['hauteur']}"
    if petit_cote < RES_HAUT:
        ajouter("resolution", "haute", f"Résolution insuffisante ({taille}) : utilisez au moins 1280×720 pour identifier les visages.")
    elif petit_cote < RES_MOYEN:
        ajouter("resolution", "moyenne", f"Résolution faible ({taille}) : 1280×720 minimum est recommandé.")
    return liste


def _agreger(mesures):
    return {
        "nettete": _mediane(mesures, "nettete"),
        "luminosite": _mediane(mesures, "luminosite"),
        "contraste": _mediane(mesures, "contraste"),
        "surexposition": _mediane(mesures, "surexposition"),
        "largeur": int(_mediane(mesures, "largeur")),
        "hauteur": int(_mediane(mesures, "hauteur")),
    }


def _niveau(score):
    if score >= 75:
        return "bonne", "Image fiable pour la surveillance."
    if score >= 50:
        return "moyenne", "Fiabilité limitée : certains visages peuvent être manqués."
    return "insuffisante", "Analyse peu fiable : risque de visages non détectés ou mal identifiés."


def _construire(mesures_liste):
    m = _agreger(mesures_liste)
    scores = _scores(m)
    problemes = _problemes(m)
    score = (0.40 * scores["nettete"] + 0.25 * scores["luminosite"]
             + 0.15 * scores["contraste"] + 0.20 * scores["resolution"])
    if any(p["gravite"] == "haute" for p in problemes):
        score = min(score, 49)          # un défaut majeur rend l'image insuffisante
    score = int(round(score))
    niveau, fiabilite = _niveau(score)
    return {
        "score": score,
        "niveau": niveau,
        "fiabilite": fiabilite,
        "scores": scores,
        "mesures": {
            "nettete": round(m["nettete"], 1), "luminosite": round(m["luminosite"], 1),
            "contraste": round(m["contraste"], 1), "largeur": m["largeur"], "hauteur": m["hauteur"],
            "images_analysees": len(mesures_liste),
        },
        "problemes": problemes,
        "conseils": [p["conseil"] for p in problemes],
    }


def evaluer_qualite(chemin, type_media):
    """Évalue une photo ou une vidéo (échantillon d'images réparties sur la durée)."""
    if type_media == "photo":
        return _construire([_mesurer(_lire_image(chemin))])

    capture = cv2.VideoCapture(chemin)
    if not capture.isOpened():
        raise ValueError("Vidéo illisible.")
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    mesures = []
    try:
        if total > 0:
            for position in np.linspace(0, max(total - 1, 0), NB_IMAGES_VIDEO).astype(int):
                capture.set(cv2.CAP_PROP_POS_FRAMES, int(position))
                ok, image = capture.read()
                if ok:
                    mesures.append(_mesurer(image))
        else:                                   # nombre d'images inconnu : on lit en séquence
            i = 0
            while len(mesures) < NB_IMAGES_VIDEO:
                ok, image = capture.read()
                if not ok:
                    break
                if i % 15 == 0:
                    mesures.append(_mesurer(image))
                i += 1
    finally:
        capture.release()
    if not mesures:
        raise ValueError("Aucune image exploitable dans la vidéo.")
    return _construire(mesures)


def ajouter_taille_visages(qualite, resultat):
    """Après l'analyse : signale des visages trop petits pour être identifiés de façon fiable."""
    cadres = [v["box"] for v in resultat.get("faces", [])]
    for instant in resultat.get("timeline", []):
        cadres += [v["box"] for v in instant.get("faces", [])]
    tailles = [min(b["bottom"] - b["top"], b["right"] - b["left"]) for b in cadres]
    if not tailles:
        return
    mediane = int(np.median(tailles))
    qualite["mesures"]["taille_visage"] = mediane
    if mediane < VISAGE_MIN:
        conseil = (f"Visages trop petits (environ {mediane} px) : rapprochez la caméra "
                   "ou utilisez un zoom pour une identification fiable.")
        qualite["problemes"].append({"code": "visage_petit", "gravite": "moyenne", "conseil": conseil})
        qualite["conseils"].append(conseil)