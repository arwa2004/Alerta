import os
import requests
import io
from PIL import Image, ImageDraw
from django.core.files.base import ContentFile

# Priorité : variable d'env → settings Django
def _get_key(env_name, settings_attr):
    val = os.environ.get(env_name, '')
    if not val or val.startswith('VOTRE_CLE'):
        try:
            from django.conf import settings
            val = getattr(settings, settings_attr, '')
        except Exception:
            pass
    if val and val.startswith('VOTRE_CLE'):
        return ''
    return val

GEMINI_API_KEY = _get_key('GEMINI_API_KEY', 'GEMINI_API_KEY')
HUGGINGFACE_API_KEY = _get_key('HUGGINGFACE_API_KEY', 'HUGGINGFACE_API_KEY')

class AlertaAIService:
    """
    Service d'Intelligence Artificielle Générative pour le Module 3 :
    1. Gemini 1.5 Flash  : Description factuelle en français de l'événement de sécurité.
    2. Hugging Face      : Image de reconstitution de la scène (Stable Diffusion).
    3. Fallback MOCK_AI  : Texte contextuel + visuel CCTV stylisé si aucune clé n'est disponible.
    """

    @classmethod
    def reload_keys(cls):
        """Recharge les clés depuis settings (utile après configuration)."""
        global GEMINI_API_KEY, HUGGINGFACE_API_KEY
        GEMINI_API_KEY = _get_key('GEMINI_API_KEY', 'GEMINI_API_KEY')
        HUGGINGFACE_API_KEY = _get_key('HUGGINGFACE_API_KEY', 'HUGGINGFACE_API_KEY')

    @classmethod
    def generate_description(cls, event_type, zone_nom, date_heure, personne_nom=None, score_confiance=0.85):
        """
        Génère une description factuelle en UNE phrase en français.
        Tente d'abord l'API Gemini, bascule sur le générateur contextuel si échec.
        """
        heure_str = date_heure.strftime('%Hh%M') if hasattr(date_heure, 'strftime') else '14h00'

        # ── Tentative Gemini (clé requise) ───────────────────────────────────
        key = _get_key('GEMINI_API_KEY', 'GEMINI_API_KEY')
        if key:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
                prompt = (
                    "Tu es le système de vidéosurveillance intelligent Alerta. "
                    "Rédige UNE SEULE phrase courte, précise et factuelle en français "
                    "pour décrire cet événement de sécurité détecté par la caméra :\n"
                    f"- Type d'événement : {event_type}\n"
                    f"- Zone surveillée : {zone_nom}\n"
                    f"- Heure de détection : {heure_str}\n"
                    f"- Personne détectée : {personne_nom if personne_nom else 'Individu non répertorié'}\n"
                    f"- Score de confiance reconnaissance faciale : {int(score_confiance * 100)}%\n"
                    "Réponds uniquement avec la phrase de description, sans guillemets ni explication."
                )
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.35,
                        "maxOutputTokens": 80,
                        "topP": 0.8,
                    }
                }
                res = requests.post(url, json=payload, timeout=8)
                if res.status_code == 200:
                    data = res.json()
                    desc = data['candidates'][0]['content']['parts'][0]['text'].strip()
                    desc = desc.strip('"\'')
                    print(f"[Gemini AI] Description générée : {desc}")
                    return desc
                else:
                    print(f"[Gemini AI] Erreur HTTP {res.status_code}: {res.text[:200]}")
            except Exception as e:
                print(f"[Gemini AI] Exception ({type(e).__name__}: {e}) → Bascule contextuelle.")

        # ── Fallback contextuel MOCK_AI ───────────────────────────────────────
        print("[Gemini AI] Aucune clé ou quota dépassé → Générateur contextuel activé.")
        return cls._mock_description(event_type, zone_nom, heure_str, personne_nom, score_confiance)

    @classmethod
    def _mock_description(cls, event_type, zone_nom, heure_str, personne_nom, score_confiance):
        conf_pct = int(score_confiance * 100)
        if event_type == 'visage_connu' and personne_nom:
            return (
                f"{personne_nom} a été formellement identifié(e) dans la zone « {zone_nom} » "
                f"à {heure_str} avec une confiance de {conf_pct}%."
            )
        elif event_type == 'inconnu':
            return (
                f"ALERTE : Un individu non répertorié a été détecté dans « {zone_nom} » "
                f"à {heure_str} — accès non autorisé signalé (confiance {conf_pct}%)."
            )
        else:  # mouvement
            return (
                f"Mouvement suspect détecté par la caméra de surveillance dans « {zone_nom} » "
                f"à {heure_str} — analyse en cours (confiance {conf_pct}%)."
            )

    @classmethod
    def generate_reconstructed_image(cls, event_type, zone_nom, description, personne_nom=None):
        """
        Génère une image de reconstitution de la scène.
        1. Tente Hugging Face (Stable Diffusion via Inference API)
        2. Fallback : image CCTV stylisée générée avec Pillow
        """
        hf_key = _get_key('HUGGINGFACE_API_KEY', 'HUGGINGFACE_API_KEY')

        if hf_key:
            # Prompt en anglais (Stable Diffusion comprend mieux l'anglais)
            type_prompt = {
                'inconnu': 'unknown intruder suspicious person trespassing',
                'visage_connu': f'authorized person recognized face {personne_nom or ""}',
                'mouvement': 'suspicious movement motion detected',
            }.get(event_type, 'security alert motion')

            prompt = (
                f"CCTV security camera footage, {type_prompt}, "
                f"indoor surveillance camera view of {zone_nom}, "
                "dark moody lighting, security camera grain, night vision green tint, "
                "realistic, cinematic, 4k surveillance footage style"
            )
            negative_prompt = "cartoon, anime, drawing, blurry, low quality, text, watermark"

            # Essai avec plusieurs modèles HF (du plus rapide au plus lent)
            hf_models = [
                "stabilityai/stable-diffusion-2-1",
                "runwayml/stable-diffusion-v1-5",
            ]
            headers = {"Authorization": f"Bearer {hf_key}"}

            for model_url_name in hf_models:
                api_url = f"https://api-inference.huggingface.co/models/{model_url_name}"
                try:
                    response = requests.post(
                        api_url,
                        headers=headers,
                        json={"inputs": prompt, "parameters": {"negative_prompt": negative_prompt}},
                        timeout=30
                    )
                    if response.status_code == 200 and response.headers.get('content-type', '').startswith('image'):
                        print(f"[Hugging Face] Image générée avec {model_url_name}")
                        fname = f"hf_{event_type}_{zone_nom[:15].replace(' ', '_')}.jpg"
                        return ContentFile(response.content, name=fname)
                    elif response.status_code == 503:
                        print(f"[Hugging Face] Modèle {model_url_name} en chargement (503), essai suivant...")
                    else:
                        print(f"[Hugging Face] Erreur {response.status_code}: {response.text[:150]}")
                except Exception as e:
                    print(f"[Hugging Face] Exception ({model_url_name}): {e}")

        # ── Fallback : image CCTV synthétique Pillow ──────────────────────────
        print("[Hugging Face] Aucune clé ou échec → Image CCTV synthétique Alerta générée.")
        return cls._generate_cctv_synthetic_image(event_type, zone_nom, description, personne_nom)

    @classmethod
    def _generate_cctv_synthetic_image(cls, event_type, zone_nom, description, personne_nom):
        """
        Crée une image de reconstitution CCTV stylisée type Alerta en Pillow.
        Utilisée comme fallback complet sans dépendance réseau.
        """
        width, height = 640, 360
        img = Image.new('RGB', (width, height), color=(10, 18, 35))
        draw = ImageDraw.Draw(img)

        # Grille de visée
        grid_color = (22, 35, 58)
        for x in range(0, width, 40):
            draw.line([(x, 0), (x, height)], fill=grid_color, width=1)
        for y in range(0, height, 40):
            draw.line([(0, y), (width, y)], fill=grid_color, width=1)

        # Couleur selon le type
        if event_type == 'visage_connu':
            box_color = (34, 197, 94)     # vert
            status_label = "ACCES AUTORISE"
        elif event_type == 'inconnu':
            box_color = (239, 68, 68)     # rouge
            status_label = "INTRUSION DETECTEE"
        else:
            box_color = (251, 191, 36)    # ambre
            status_label = "MOUVEMENT SUSPECT"

        # Cadre de détection avec coins stylisés
        draw.rectangle([(175, 75), (465, 285)], outline=box_color, width=2)
        corner = 22
        for (cx, cy, dx, dy) in [
            (175, 75,  1,  1), (465, 75, -1,  1),
            (175, 285, 1, -1), (465, 285,-1, -1),
        ]:
            draw.line([(cx, cy), (cx + dx * corner, cy)], fill=box_color, width=3)
            draw.line([(cx, cy), (cx, cy + dy * corner)], fill=box_color, width=3)

        # Silhouette
        head_color = (55, 70, 95)
        draw.ellipse([(292, 110), (348, 165)], fill=head_color)
        draw.polygon([(260, 260), (380, 260), (352, 180), (288, 180)], fill=head_color)

        # Cercle de scan rotatif (visuel IA)
        scan_color = (*box_color[:3], 100)
        draw.arc([(270, 90), (370, 185)], 0, 270, fill=box_color, width=2)

        # HUD overlay
        zone_str = zone_nom.upper()[:20]
        id_str = personne_nom.upper()[:18] if (event_type == 'visage_connu' and personne_nom) else "NON REPERTORIE"

        draw.text((12, 12), "● REC  ALERTA AI CAM-01", fill=(220, 50, 50))
        draw.text((12, 32), f"ZONE: {zone_str}", fill=(130, 155, 190))
        draw.text((12, 340), f"STATUT: {status_label}", fill=box_color)
        draw.text((width - 200, 12), f"ID: {id_str}", fill=(130, 155, 190))
        draw.text((width - 200, 340), "IA: ALERTA VISION v3", fill=(0, 194, 203))

        # Ligne de scan IA horizontale (effet)
        draw.rectangle([(175, 180), (465, 182)], fill=(*box_color, 120))

        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=88)
        buffer.seek(0)
        safe_zone = zone_nom[:12].replace(' ', '_')
        return ContentFile(buffer.getvalue(), name=f"cctv_{event_type}_{safe_zone}.jpg")
