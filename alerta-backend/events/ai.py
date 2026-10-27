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
        Génère une analyse d'expert en sécurité via l'API Google Gemini.
        Appelé explicitement via le bouton utilisateur.
        """
        gemini_key = _get_key('GEMINI_API_KEY', 'GEMINI_API_KEY')
        conf_pct = int(score_confiance * 100)

        prompt = (
            f"Tu es le système expert de sécurité IA d'Alerta. "
            f"Rédige un compte-rendu d'incident professionnel et concis (3 à 4 phrases maximum) en français. "
            f"Détails de l'incident : "
            f"- Type : {event_type} "
            f"- Zone : {zone_nom} "
            f"- Horodatage : {heure_str} "
            f"- Niveau de criticité évalué : {score_criticite} "
            f"- Indice de confiance de détection : {conf_pct}% "
            + (f"- Nom de la personne reconnue : {personne_nom} " if personne_nom else "- Individu : Inconnu non enregistré ") +
            f"Donne une brève interprétation de la situation et une recommandation opérationnelle pour l'équipe de sécurité."
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

        # 3. Fallback Expert Contextuel Alerta
        print("[Gemini AI] Utilisation du moteur d'analyse contextuelle Alerta Security.")
        return cls._generate_expert_security_analysis(event_type, zone_nom, heure_str, score_criticite, conf_pct, personne_nom)

    @classmethod
    def _generate_expert_security_analysis(cls, event_type, zone_nom, heure_str, score_criticite, conf_pct, personne_nom):
        """Génère une analyse détaillée d'expert de sécurité Alerta."""
        if event_type == 'visage_connu' and personne_nom:
            return (
                f"Validation d'accès : La personne « {personne_nom} » a été identifiée "
                f"dans la zone « {zone_nom} » à {heure_str} (indice de confiance : {conf_pct}%). "
                f"Niveau de criticité évalué : {score_criticite}. "
                f"Aucune anomalie détectée dans les protocoles de passage. Statut sécurisé."
            )
        elif event_type in ['inconnu', 'visage_inconnu']:
            return (
                f"ALERTE DÉTECTION INTRUSION : Présence d'un individu non répertorié constatée dans le secteur « {zone_nom} » "
                f"à {heure_str} (indice de confiance détection : {conf_pct}%). "
                f"Le modèle prédictif classe cet incident comme criticité « {score_criticite.upper()} ». "
                f"Recommandation : Vérification du média source et envoi d'une notification d'intervention."
            )
        else:  # Mouvement
            return (
                f"Rapport cinématique : Mouvement irrégulier intercepté par les capteurs dans « {zone_nom} » "
                f"à {heure_str} (indice de confiance : {conf_pct}%). "
                f"Criticité : {score_criticite}. "
                f"Préconisation : Surveillance renforcée de la zone et vérification des ouvertures périmétriques."
            )

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
    def generer_description_experte(cls, event_type, zone_nom, heure_str, score_criticite,
                                     score_confiance, personne_nom=None):
        """
        Génère dès la création une description IA experte complète (sans appel API externe).
        C'est CETTE description qui sert de base au prompt de génération d'image.
        Le bouton Gemini peut ensuite l'enrichir encore davantage.
        """
        conf_pct = int((score_confiance or 0.85) * 100)
        return cls._generate_expert_security_analysis(
            event_type=event_type,
            zone_nom=zone_nom,
            heure_str=heure_str,
            score_criticite=score_criticite or 'moyen',
            conf_pct=conf_pct,
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
        # La description est l'analyse experte générée dès la création (et enrichie par Gemini ensuite).
        # Elle sert de base sémantique pour guider le modèle text-to-image.
        description_ia = evenement.description or ''

        # Prompt principal (bilingue : zone en clair, contexte en anglais pour FLUX.1)
        # On garde la description IA tronquée (120 car.) pour enrichir le contexte visuel.
        desc_ascii = description_ia[:120].encode('ascii', 'ignore').decode('ascii').strip()
        prompt_hf = (
            f"CCTV security camera surveillance footage still frame, location: {zone_nom}, "
            f"nighttime low light grainy realistic, "
            f"{desc_ascii}"
        )

        # Traduction contextuelle pour le prompt Pollinations (FLUX.1 optimisé English)
        severity_map = {'eleve': 'high alert critical intrusion', 'moyen': 'medium alert suspicious', 'faible': 'low alert authorized access'}
        type_map = {
            'inconnu': 'unknown intruder unidentified person trespassing restricted zone',
            'visage_inconnu': 'unidentified suspicious person detected security breach',
            'visage_connu': f'authorized person {evenement.personne_nom or "resident"} access granted',
            'mouvement': 'motion detected suspicious movement anomaly area',
        }
        severity_ctx = severity_map.get(evenement.niveau_criticite, 'security surveillance')
        incident_ctx = type_map.get(evenement.type, 'security anomaly detected')
        prompt_pollinations = (
            f"CCTV security camera surveillance still frame, {zone_nom}, nighttime, "
            f"low light, grainy realistic footage, {incident_ctx}, {severity_ctx}, "
            f"professional security system recording"
        )
        prompt_pollinations_clean = prompt_pollinations.encode('ascii', 'ignore').decode('ascii')

        print(f"[IA Image] Prompt base: {prompt_hf[:80]}...")

        # 1. Tentative Hugging Face (text-to-image depuis description IA)
        if hf_token and InferenceClient is not None:
            try:
                client = InferenceClient(token=hf_token)
                img = client.text_to_image(prompt_hf, model="black-forest-labs/FLUX.1-schnell")
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

        # 2. Alternative gratuite Pollinations — prompt construit depuis la description IA
        try:
            import urllib.parse
            url_pollinations = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt_pollinations_clean)}"
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
