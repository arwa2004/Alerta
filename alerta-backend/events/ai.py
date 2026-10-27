"""
events/ai.py — Service d'Intelligence Artificielle Générative d'Alerta.

Intègre :
1. Google Gemini : Génération à la demande de l'analyse experte et des recommandations.
2. Hugging Face (InferenceClient) : Reconstitution d'image par IA (text-to-image).
3. Fallback Simulation : Rendu visuel d'ambiance en cas d'absence de quotas ou connexion.
"""
from io import BytesIO
import base64
import mimetypes
import random
import requests
from PIL import Image, ImageDraw
from django.core.files.base import ContentFile
from django.conf import settings
import os


# ─── Prompt Vision (ne contient PAS le type d'événement : évite la confirmation hallucinée) ──
_VISION_PROMPT = (
    "Tu es analyste de vidéosurveillance rigoureux pour le système de sécurité Alerta. "
    "Décris en français en 2 à 3 phrases EXACTEMENT et UNIQUEMENT ce qui est directement visible sur cette image : "
    "personnes (vêtements, posture, accessoires), objets, éclairage, contexte et couleurs observables. "
    "Règle absolue : n'invente absolument rien qui ne soit pas visible à l'image. "
    "Si l'image est floue, vide, unie ou ne montre personne, indique-le clairement. "
    "Zone surveillée : {zone}."
)


def decrire_photo_gemini(ev):
    """
    Décrit la vraie photo avec Gemini Vision (multimodal).
    Utilise settings.GEMINI_MODEL et settings.GEMINI_API_KEY.
    Lève une exception en cas d'échec (HTTP error, quota, réseau…).
    """
    gemini_key = getattr(settings, 'GEMINI_API_KEY', '') or os.environ.get('GEMINI_API_KEY', '')
    if not gemini_key or gemini_key.startswith('VOTRE_CLE_'):
        raise ValueError("Clé Gemini non configurée.")

    gemini_model = getattr(settings, 'GEMINI_MODEL', 'gemini-3.1-flash-lite')
    zone_nom = ev.zone.nom if getattr(ev, 'zone_id', None) else getattr(ev, 'zone_nom_fallback', 'inconnue')

    with ev.photo_capturee.open("rb") as f:
        image_bytes = f.read()

    b64_data = base64.b64encode(image_bytes).decode('utf-8')
    mime = mimetypes.guess_type(ev.photo_capturee.name)[0] or "image/jpeg"

    # Tentative avec le modèle configuré, puis fallback modèles actifs
    models_to_try = [gemini_model, 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash']
    # Déduplication en préservant l'ordre
    seen = set()
    models_candidates = [m for m in models_to_try if not (m in seen or seen.add(m))]

    last_error = None
    for model_name in models_candidates:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
        payload = {
            "contents": [{
                "parts": [
                    {"text": _VISION_PROMPT.format(zone=zone_nom)},
                    {"inline_data": {"mime_type": mime, "data": b64_data}},
                ]
            }],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 350},
        }
        try:
            r = requests.post(
                url,
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=30,
            )
            if r.status_code == 200:
                text = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                print(f"[Gemini Vision] Analyse réussie via {model_name}.")
                return text
            else:
                last_error = f"{model_name} HTTP {r.status_code}: {r.text[:100]}"
                print(f"[Gemini Vision Warning] {last_error}")
        except Exception as e:
            last_error = f"{model_name} exception: {e}"
            print(f"[Gemini Vision Warning] {last_error}")

    raise RuntimeError(f"Échec de l'analyse visuelle Gemini : {last_error}")

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
    def generate_gemini_analysis(cls, event_type, zone_nom, heure_str, score_criticite, score_confiance, personne_nom=None, photo_capturee=None):
        """
        Génère une description de scène via l'API Google Gemini :
        - Si une photo réelle (photo_capturee) est fournie : appelle Gemini Vision multimodal
          en lui demandant de décrire UNIQUEMENT ce qui est directement visible sur l'image.
          description_source = 'gemini_vision'
        - Sans photo : génère une synthèse factuelle textuelle sobre.
          description_source = 'gemini_texte' (ou 'simulation' en repli local)
        Retourne : (description: str, description_source: str)
        """
        import base64
        gemini_key = _get_key('GEMINI_API_KEY', 'GEMINI_API_KEY')

        # ─── Cas 1 : Vraie photo disponible ➔ GEMINI VISION MULTIMODAL ────────────
        if photo_capturee and gemini_key:
            try:
                # Lecture des octets de la photo
                photo_capturee.seek(0)
                image_bytes = photo_capturee.read()
                b64_img = base64.b64encode(image_bytes).decode('utf-8')
                mime_type = "image/png" if getattr(photo_capturee, 'name', '').lower().endswith('.png') else "image/jpeg"

                vision_prompt = (
                    f"Tu es l'agent de vision IA du système de sécurité Alerta. "
                    f"Analyse cette capture de vidéosurveillance issue de la zone « {zone_nom} » (enregistrée à {heure_str}). "
                    f"Règle absolue : décris UNIQUEMENT et fidèlement ce qui est visible sur cette image "
                    f"(présence d'individus, posture, allure, tenue ou accessoires visibles, luminosité et contexte immédiat). "
                    f"N'invente rien qui ne soit pas directement observable. "
                    f"Formule une description professionnelle et sobre en français (2 à 3 phrases maximum)."
                )

                for model_candidate in ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']:
                    url_gen = f"https://generativelanguage.googleapis.com/v1beta/models/{model_candidate}:generateContent?key={gemini_key}"
                    payload_gen = {
                        "contents": [{
                            "parts": [
                                {
                                    "inlineData": {
                                        "mimeType": mime_type,
                                        "data": b64_img
                                    }
                                },
                                {"text": vision_prompt}
                            ]
                        }],
                        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 300}
                    }
                    res = requests.post(url_gen, json=payload_gen, timeout=10)
                    if res.status_code == 200:
                        data = res.json()
                        desc = data['candidates'][0]['content']['parts'][0]['text'].strip()
                        print(f"[Gemini Vision] Analyse de l'image réelle effectuée avec succès via {model_candidate}")
                        return desc, 'gemini_vision'
            except Exception as e:
                print(f"[Gemini Vision Erreur] {e}")

        # ─── Cas 2 : Pas de photo ➔ GEMINI TEXTE (synthèse factuelle) ─────────────
        if gemini_key:
            if event_type in ['inconnu', 'visage_inconnu']:
                situation = f"une personne non reconnue a été détectée dans la zone « {zone_nom} » à {heure_str}"
            elif event_type == 'visage_connu':
                nom = personne_nom or 'un résident autorisé'
                situation = f"{nom} a été identifié(e) dans la zone « {zone_nom} » à {heure_str}"
            else:
                situation = f"un mouvement a été capté dans la zone « {zone_nom} » à {heure_str}"

            text_prompt = (
                f"Tu es le système d'alerte de sécurité Alerta. "
                f"Incident : {situation}. "
                f"Aucune image n'est attachée à cet événement. "
                f"Rédige une notification factuelle et sobre en français (2 phrases maximum). "
                f"N'invente pas d'action détaillée (pas de vêtements imaginaires, pas de gestes non prouvés)."
            )

            try:
                for model_candidate in ['gemini-2.5-flash', 'gemini-1.5-flash']:
                    url_gen = f"https://generativelanguage.googleapis.com/v1beta/models/{model_candidate}:generateContent?key={gemini_key}"
                    payload_gen = {
                        "contents": [{"parts": [{"text": text_prompt}]}],
                        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 200}
                    }
                    res2 = requests.post(url_gen, json=payload_gen, timeout=5)
                    if res2.status_code == 200:
                        data2 = res2.json()
                        desc = data2['candidates'][0]['content']['parts'][0]['text'].strip()
                        print(f"[Gemini Texte] Synthèse factuelle générée avec {model_candidate}")
                        return desc, 'gemini_texte'
            except Exception as e:
                print(f"[Gemini Texte Erreur] {e}")

        # ─── Cas 3 : Repli local sans API ➔ SCÉNARIO SIMULÉ EXPLICITE ─────────────
        print("[Alerta Local] Génération d'une description factuelle de simulation.")
        return cls._generate_scene_description(event_type, zone_nom, heure_str, personne_nom), 'simulation'

    @classmethod
    def _generate_scene_description(cls, event_type, zone_nom, heure_str, personne_nom):
        """
        Génère une description factuelle et honnête sans extrapolation imaginaire.
        Utilisé lorsque aucune capture réelle n'est soumise à l'analyse visuelle.
        """
        if event_type == 'visage_connu' and personne_nom:
            return f"Passage autorisé : {personne_nom} a été identifié(e) dans la zone « {zone_nom} » à {heure_str} (accès normal validé)."
        elif event_type in ['inconnu', 'visage_inconnu']:
            return f"Alerte détection : Présence d'un individu non répertorié dans la zone « {zone_nom} » à {heure_str}. Vérification visuelle recommandée."
        else:
            return f"Détection cinématique : Mouvement inhabituel intercepté dans le secteur « {zone_nom} » à {heure_str}."

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
                return True, "Image générée avec succès via Hugging Face."
            except Exception as e:
                print("[Hugging Face 402/Indisponible -> Bascule vers Pollinations FLUX.1]")

        # 2. Alternative gratuite Pollinations — prompt construit depuis la description IA
        pollinations_error = None
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
                return True, "Image générée avec succès par l'IA (Moteur FLUX.1)."
            elif res.status_code == 402:
                pollinations_error = "Limite gratuite temporaire atteinte (1 image / 45s). Votre image actuelle est conservée, réessayez dans quelques secondes."
                print(f"[Pollinations Rate Limit 402] {pollinations_error}")
            else:
                pollinations_error = f"Le service d'image IA est momentanément indisponible (Code {res.status_code})."
        except Exception as e:
            pollinations_error = f"Erreur de connexion au service d'image : {e}"
            print(f"[IA Ouverte Pollinations non disponible: {e}]")

        # 3. Si HF et Pollinations échouent mais qu'une image IA existait déjà : on la GARDE intacte !
        if evenement.image_source in ('hf', 'ia_ouverte') and evenement.image_reconstituee:
            print("[IA Image] Echec de regeneration, image IA existante conservee.")
            return False, pollinations_error or "Génération indisponible. L'image IA précédente est conservée."

        # 4. Fallback Simulation locale (uniquement si aucune image n'existait encore)
        print("[Reconstitution] Generation du rendu de simulation locale (image_source=simulation)")
        cls.generer_rendu_simulation(evenement)
        evenement.image_source = "simulation"
        evenement.save(update_fields=['image_reconstituee', 'image_source'])
        return True, "Rendu de simulation synthétique généré."

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
