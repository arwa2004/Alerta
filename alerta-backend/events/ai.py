"""
events/ai.py — Service d'Intelligence Artificielle Générative d'Alerta.

Intègre :
1. Google Gemini : Génération à la demande de l'analyse experte et des recommandations.
2. Hugging Face (InferenceClient) : Reconstitution d'image par IA (text-to-image).
3. Fallback Simulation : Rendu visuel d'ambiance en cas d'absence de quotas ou connexion.
"""
from io import BytesIO
import random
import requests
from PIL import Image, ImageDraw
from django.core.files.base import ContentFile
from django.conf import settings
import os

try:
    from huggingface_hub import InferenceClient
except ImportError:
    InferenceClient = None


def _get_key(setting_name, env_name):
    """Récupère une clé depuis settings.py ou variable d'environnement."""
    val = getattr(settings, setting_name, '') or os.environ.get(env_name, '')
    if val.startswith('VOTRE_CLE_'):
        return ''
    return val.strip()


class AlertaAIService:
    """Service centralisé pour les fonctionnalités IA du Module 3."""

    @classmethod
    def generate_gemini_analysis(cls, event_type, zone_nom, heure_str, score_criticite, score_confiance, personne_nom=None):
        """
        Génère une description de scène réaliste via l'API Google Gemini.
        Appelé explicitement via le bouton utilisateur dans la modale.
        La description est focalisée sur CE QUI S'EST PASSÉ concrètement dans la scène,
        sans termes techniques (pas de score, pas de modèle prédictif, pas de recommandation générique).
        """
        gemini_key = _get_key('GEMINI_API_KEY', 'GEMINI_API_KEY')

        if event_type in ['inconnu', 'visage_inconnu']:
            situation = f"une personne non reconnue a été détectée dans la zone « {zone_nom} » à {heure_str}"
            consigne = "Décris concrètement ce que la caméra aurait capturé : les gestes, l'attitude, le comportement de la personne, l'ambiance de la scène. Sois précis et visuel."
        elif event_type == 'visage_connu':
            nom = personne_nom or 'un résident connu'
            situation = f"{nom} a été identifié(e) dans la zone « {zone_nom} » à {heure_str}"
            consigne = "Décris le passage normal de cette personne : son allure, ses gestes, ce que la caméra aurait capturé au moment de son entrée."
        else:
            situation = f"un mouvement inhabituel a été détecté dans la zone « {zone_nom} » à {heure_str}"
            consigne = "Décris ce que la caméra aurait capturé : la nature du mouvement, l'origine possible, l'ambiance visuelle de la scène."

        prompt = (
            f"Tu es une IA de reconstitution de scène de sécurité. "
            f"Situation détectée : {situation}. "
            f"{consigne} "
            f"Réponds UNIQUEMENT avec 2 à 3 phrases de description de scène. "
            f"N'inclus PAS de score, de pourcentage, de niveau de criticité, ni de recommandation. "
            f"Écris comme si tu décrivais une image que tu vois."
        )

        if gemini_key:
            # 1. Tentative avec l'API v1beta/interactions
            try:
                url_interactions = "https://generativelanguage.googleapis.com/v1beta/interactions"
                headers = {'x-goog-api-key': gemini_key, 'Content-Type': 'application/json'}
                payload = {'model': 'gemini-3.8-flash', 'input': prompt}
                res = requests.post(url_interactions, headers=headers, json=payload, timeout=6)
                if res.status_code == 200:
                    data = res.json()
                    output_text = data.get('output_text') or data.get('output', {}).get('text') or ''
                    if output_text:
                        print("[Gemini Interactions] Analyse generee avec succes")
                        return output_text.strip()
            except Exception as e:
                print(f"[Gemini Interactions] Exception: {e}")

            # 2. Tentative avec v1beta generateContent
            try:
                for model_candidate in ['gemini-2.5-flash', 'gemini-1.5-flash']:
                    url_gen = f"https://generativelanguage.googleapis.com/v1beta/models/{model_candidate}:generateContent?key={gemini_key}"
                    payload_gen = {
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.4, "maxOutputTokens": 300}
                    }
                    res2 = requests.post(url_gen, json=payload_gen, timeout=5)
                    if res2.status_code == 200:
                        data2 = res2.json()
                        desc = data2['candidates'][0]['content']['parts'][0]['text'].strip()
                        print(f"[Gemini Content] Analyse generee avec {model_candidate}")
                        return desc
            except Exception as e:
                print(f"[Gemini Content] Exception: {e}")

        # 3. Fallback : description de scène contextuelle sans API
        print("[Gemini AI] Utilisation du moteur de description de scene Alerta.")
        return cls._generate_scene_description(event_type, zone_nom, heure_str, personne_nom)

    @classmethod
    def _generate_scene_description(cls, event_type, zone_nom, heure_str, personne_nom):
        """
        Fallback sans API : génère une description de scène réaliste et contextuelle.
        Focalisée sur CE QUI SE PASSE dans la scène, sans termes techniques.
        """
        import random
        if event_type == 'visage_connu' and personne_nom:
            scenes = [
                f"La caméra de la zone « {zone_nom} » a capturé {personne_nom} franchissant l'accès à {heure_str}. La démarche est assurée, le passage rapide et direct vers l'intérieur. Rien d'inhabituel dans le comportement observé.",
                f"À {heure_str}, {personne_nom} est entré(e) dans la zone « {zone_nom} ». La silhouette est reconnaissable immédiatement, le mouvement calme et familier. La porte s'est refermée normalement derrière la personne.",
            ]
        elif event_type in ['inconnu', 'visage_inconnu']:
            scenes = [
                f"La caméra de « {zone_nom} » a enregistré une silhouette inconnue à {heure_str}. La personne longe le mur, le capuchon relevé, les mouvements lents et furtifs. Elle marque une pause avant de se diriger vers l'intérieur.",
                f"À {heure_str}, une personne non identifiée est apparue dans le champ de « {zone_nom} ». Le comportement est hésitant : regards répétés vers les caméras, déplacements irréguliers. La présence semble non planifiée.",
                f"La scène capturée dans « {zone_nom} » à {heure_str} montre un individu dont le visage n'est pas dans la base. Il s'approche de la zone d'accès, vérifie les alentours, et tente d'ouvrir une porte.",
            ]
        else:
            scenes = [
                f"La caméra de « {zone_nom} » a détecté un mouvement à {heure_str}. Une ombre traverse rapidement le cadre, probablement causée par un objet déplacé ou une ouverture de porte. La zone redevient calme immédiatement après.",
                f"À {heure_str}, un déplacement inattendu a été capturé dans « {zone_nom} ». Le mouvement est bref, de faible amplitude, et pourrait correspondre au passage d'un animal ou à un élément extérieur.",
            ]
        return random.choice(scenes)

    @classmethod
    def generate_initial_description(cls, event_type, zone_nom, heure_str, personne_nom=None):
        """Description brute initiale avant déclenchement de l'analyse Gemini."""
        if event_type == 'visage_connu' and personne_nom:
            return f"Détection de l'utilisateur autorisé {personne_nom} dans {zone_nom} à {heure_str}."
        elif event_type in ['inconnu', 'visage_inconnu']:
            return f"Détection d'un individu non identifié dans la zone {zone_nom} à {heure_str}."
        else:
            return f"Mouvement suspect détecté dans la zone {zone_nom} à {heure_str}."

    @classmethod
    def generer_description_experte(cls, event_type, zone_nom, heure_str, score_criticite=None,
                                     score_confiance=None, personne_nom=None):
        """
        Génère une description de scène réaliste (sans appel API externe).
        Utilisable comme fallback ou pour pré-remplir la description.
        """
        return cls._generate_scene_description(
            event_type=event_type,
            zone_nom=zone_nom,
            heure_str=heure_str,
            personne_nom=personne_nom or None
        )

    @classmethod
    def generer_image_reconstitution(cls, evenement):
        """
        Reconstitue la scène de l'événement en générant une image depuis la description IA :
        1. Tente Hugging Face (text-to-image avec InferenceClient)
        2. Alternative gratuite Pollinations FLUX.1 (prompt construit depuis la description IA)
        3. Fallback simulation locale (hors ligne)
        Met à jour image_source ('hf', 'ia_ouverte' ou 'simulation').
        """
        hf_token = _get_key('HUGGINGFACE_API_KEY', 'HUGGINGFACE_API_KEY') or _get_key('HF_TOKEN', 'HF_TOKEN')
        zone_nom = evenement.zone.nom if evenement.zone else evenement.zone_nom_fallback

        # ─── Construction du prompt depuis la description IA ───────────────────────
        # La description est celle générée par Gemini (ou le fallback expert).
        # Elle décrit concrètement la scène (ex: "silhouette inconnue longe le mur, capuchon relevé...")
        # C'est cette description qui guide le modèle text-to-image.
        description_ia = evenement.description or ''

        # Nettoyage : garder 150 car. pertinents, convertir en ASCII pour l'API
        desc_clean = description_ia[:150].encode('ascii', 'ignore').decode('ascii').strip()

        # Prompt unique utilisé par HF et Pollinations
        prompt_image = (
            f"CCTV security camera surveillance footage still frame, "
            f"location: {zone_nom}, nighttime, low light, grainy, realistic, "
            f"{desc_clean}"
        )
        prompt_image_safe = prompt_image.encode('ascii', 'ignore').decode('ascii')

        print(f"[IA Image] Prompt depuis description IA: {prompt_image_safe[:100]}...")

        # 1. Tentative Hugging Face (text-to-image depuis description IA)
        if hf_token and InferenceClient is not None:
            try:
                client = InferenceClient(token=hf_token)
                img = client.text_to_image(prompt_image, model="black-forest-labs/FLUX.1-schnell")
                buf = BytesIO()
                img.save(buf, format="JPEG")
                evenement.image_reconstituee.save(
                    f"hf_{evenement.id}.jpg",
                    ContentFile(buf.getvalue()),
                    save=False
                )
                evenement.image_source = "hf"
                evenement.save(update_fields=['image_reconstituee', 'image_source'])
                print("[Hugging Face] Image generee depuis description IA (image_source=hf)")
                return
            except Exception as e:
                print(f"[Hugging Face 402/Indisponible -> Bascule vers Pollinations FLUX.1]")

        # 2. Alternative gratuite Pollinations — même prompt construit depuis la description IA
        try:
            import urllib.parse
            url_pollinations = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt_image_safe)}"
            params = {"width": 640, "height": 360, "nologo": "true", "seed": random.randint(100, 999999)}
            res = requests.get(url_pollinations, params=params, timeout=25)
            if res.status_code == 200 and len(res.content) > 3000:
                evenement.image_reconstituee.save(
                    f"flux_{evenement.id}.jpg",
                    ContentFile(res.content),
                    save=False
                )
                evenement.image_source = "ia_ouverte"
                evenement.save(update_fields=['image_reconstituee', 'image_source'])
                print("[IA Generative Ouverte] Image FLUX.1 generee depuis description IA (image_source=ia_ouverte)")
                return
        except Exception as e:
            print(f"[IA Ouverte Pollinations non disponible: {e}]")

        # 3. Fallback Simulation locale (hors ligne)
        print("[Reconstitution] Generation du rendu de simulation locale (image_source=simulation)")
        cls.generer_rendu_simulation(evenement)
        evenement.image_source = "simulation"
        evenement.save(update_fields=['image_reconstituee', 'image_source'])

    @classmethod
    def generer_rendu_simulation(cls, evenement):
        """
        Génère un rendu visuel de simulation sobre et transparent pour la soutenance.
        Pas de faux 'DIRECT' ni de faux 'REC' clignotant.
        """
        width, height = 640, 360
        img = Image.new('RGB', (width, height), color=(14, 20, 28))
        draw = ImageDraw.Draw(img)

        zone_nom = evenement.zone.nom if evenement.zone else evenement.zone_nom_fallback
        event_type = evenement.type
        personne_nom = evenement.personne_nom

        # Fond avec perspective de pièce
        draw.polygon([(0, 0), (width, 0), (width * 0.8, height * 0.35), (width * 0.2, height * 0.35)], fill=(18, 25, 36))
        draw.polygon([(0, 0), (width * 0.2, height * 0.35), (width * 0.2, height * 0.85), (0, height)], fill=(12, 17, 24))
        draw.polygon([(width, 0), (width * 0.8, height * 0.35), (width * 0.8, height * 0.85), (width, height)], fill=(12, 17, 24))
        draw.polygon([(width * 0.2, height * 0.35), (width * 0.8, height * 0.35), (width * 0.8, height * 0.85), (width * 0.2, height * 0.85)], fill=(22, 32, 44))
        draw.polygon([(0, height), (width * 0.2, height * 0.85), (width * 0.8, height * 0.85), (width, height)], fill=(10, 14, 20))

        # Silhouette
        cx, cy = int(width * 0.5), int(height * 0.58)
        draw.ellipse([cx - 45, cy + 50, cx + 45, cy + 65], fill=(6, 8, 12))

        if event_type in ['inconnu', 'visage_inconnu']:
            draw.polygon([(cx - 28, cy + 55), (cx + 28, cy + 55), (cx + 22, cy - 10), (cx - 22, cy - 10)], fill=(35, 45, 58))
            draw.ellipse([cx - 18, cy - 38, cx + 18, cy - 8], fill=(28, 36, 48))
            # Bounding box
            bx1, by1, bx2, by2 = cx - 40, cy - 48, cx + 40, cy + 58
            draw.rectangle([bx1, by1, bx2, by2], outline=(230, 57, 70), width=2)
            draw.rectangle([bx1, by1 - 18, bx1 + 120, by1], fill=(230, 57, 70))
            draw.text((bx1 + 4, by1 - 15), "INCONNU (Simulé)", fill=(255, 255, 255))
        elif event_type == 'visage_connu':
            draw.polygon([(cx - 26, cy + 55), (cx + 26, cy + 55), (cx + 20, cy - 10), (cx - 20, cy - 10)], fill=(32, 50, 42))
            draw.ellipse([cx - 16, cy - 36, cx + 16, cy - 10], fill=(42, 65, 54))
            bx1, by1, bx2, by2 = cx - 35, cy - 45, cx + 35, cy + 58
            draw.rectangle([bx1, by1, bx2, by2], outline=(0, 194, 203), width=2)
            p_name = (personne_nom or "AUTORISE")[:12].upper()
            draw.rectangle([bx1, by1 - 18, bx1 + 115, by1], fill=(0, 194, 203))
            draw.text((bx1 + 4, by1 - 15), f"{p_name} [OK]", fill=(11, 31, 58))
        else:
            draw.ellipse([cx - 50, cy - 30, cx + 50, cy + 40], outline=(255, 183, 3), width=2)
            draw.text((cx - 55, cy - 48), "MOUVEMENT DETECTE", fill=(255, 183, 3))

        # Scanlines légères
        for y in range(0, height, 4):
            draw.line([(0, y), (width, y)], fill=(8, 12, 16, 30))

        # Bandeau OSD sobre (sans 'DIRECT' ni 'REC')
        draw.text((20, 16), f"RECONSTITUTION SCENE • ZONE: {zone_nom.upper()}", fill=(0, 194, 203))
        draw.text((20, height - 28), "ALERTA MODULE 3 • ILLUSTRATION SYNTHETIQUE", fill=(140, 160, 175))

        out = BytesIO()
        img.save(out, format='JPEG', quality=88)
        evenement.image_reconstituee.save(
            f"sim_{evenement.id}.jpg",
            ContentFile(out.getvalue()),
            save=False
        )
