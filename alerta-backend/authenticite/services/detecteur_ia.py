import threading

from django.conf import settings
from PIL import Image

_pipeline = None
_echec = None
_verrou = threading.Lock()
MOTS_FAUX = ("artificial", "fake", "generated", "deepfake", "synthetic")


def _charger():
    global _pipeline, _echec
    with _verrou:
        if _pipeline is None and _echec is None:
            try:
                from transformers import pipeline
                nom = getattr(settings, "AUTH_MODELE_IA", "umm-maybe/AI-image-detector")
                _pipeline = pipeline("image-classification", model=nom)
            except Exception as e:                       # hors ligne, torch absent...
                _echec = str(e)[:200]
    return _pipeline


def analyser_ia(chemin):
    detecteur = _charger()
    if detecteur is None:
        return {"score": None, "indices": [f"Détecteur IA indisponible : {_echec}"]}

    image = Image.open(chemin).convert("RGB")
    resultats = detecteur(image, top_k=5)

    trouve, proba_faux = False, 0.0
    for r in resultats:
        etiquette = r["label"].lower()
        if etiquette == "ai" or any(m in etiquette for m in MOTS_FAUX):
            trouve = True
            proba_faux += r["score"]

    if not trouve:
        etiquettes = ", ".join(r["label"] for r in resultats)
        return {"score": None, "indices": [f"Étiquettes du modèle non reconnues : {etiquettes}"]}

    score = round(proba_faux * 100, 1)
    if score >= 60:
        indices = [f"Le modèle estime à {score} % la probabilité d'une image générée ou synthétique"]
    else:
        indices = [f"Image jugée naturelle par le modèle ({score} % de probabilité de synthèse)"]
    return {"score": score, "indices": indices}