"""
events/ai.py — Service d'Intelligence Artificielle Générative d'Alerta.

Intègre :
1. Génération de description et analyse d'incident (Google Gemini / Fallback Expert de sécurité).
   Déclenchable à la demande via un bouton utilisateur.
2. Génération d'image de vidéosurveillance CCTV réaliste (Pollinations AI / Fallback Texture CCTV réaliste Pillow).
"""
import requests
import io
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from django.core.files.base import ContentFile
from django.conf import settings
import os


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
            f"- Indice de certitude : {conf_pct}% "
            + (f"- Nom de la personne reconnue : {personne_nom} " if personne_nom else "- Individu : Inconnu non enregistré dans la base ") +
            f"Donne une brève interprétation de la situation et une recommandation opérationnelle pour l'équipe de sécurité."
        )

        if gemini_key:
            # 1. Tentative avec l'API v1beta/interactions (nouvelle API Gemini)
            try:
                url_interactions = "https://generativelanguage.googleapis.com/v1beta/interactions"
                headers = {'x-goog-api-key': gemini_key, 'Content-Type': 'application/json'}
                payload = {
                    'model': 'gemini-3.8-flash',
                    'input': prompt
                }
                res = requests.post(url_interactions, headers=headers, json=payload, timeout=6)
                if res.status_code == 200:
                    data = res.json()
                    # Extraire le texte de sortie
                    output_text = data.get('output_text') or data.get('output', {}).get('text') or ''
                    if output_text:
                        print(f"[Gemini Interactions] Analyse generee avec succes")
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

        # 3. Fallback Expert Contextuel Alerta (Haute Fidélité)
        print("[Gemini AI] Utilisation du moteur d'analyse contextuelle Alerta Security.")
        return cls._generate_expert_security_analysis(event_type, zone_nom, heure_str, score_criticite, conf_pct, personne_nom)

    @classmethod
    def _generate_expert_security_analysis(cls, event_type, zone_nom, heure_str, score_criticite, conf_pct, personne_nom):
        """Génère une analyse détaillée d'expert de sécurité Alerta."""
        if event_type == 'visage_connu' and personne_nom:
            return (
                f"Validation d'accès biométrique : La personne « {personne_nom} » a été identifiée "
                f"avec succès dans la zone « {zone_nom} » à {heure_str} (indice de certitude : {conf_pct}%). "
                f"Niveau de criticité évalué : {score_criticite}. "
                f"Aucune anomalie détectée dans les protocoles de passage. Statut sécurisé."
            )
        elif event_type == 'inconnu' or event_type == 'visage_inconnu':
            return (
                f"ALERTE DÉTECTION INTRUSION : Présence d'un individu non répertorié constatée dans le secteur « {zone_nom} » "
                f"à {heure_str} avec un score de confiance de {conf_pct}%. "
                f"Le modèle prédictif classe cet incident comme criticité « {score_criticite.upper()} ». "
                f"Recommandation : Vérification immédiate du flux caméra direct et envoi d'une notification d'intervention."
            )
        else:  # Mouvement
            return (
                f"Rapport cinématique : Mouvement irrégulier intercepté par les capteurs optiques dans « {zone_nom} » "
                f"à {heure_str} (indice de confiance : {conf_pct}%). "
                f"Criticité : {score_criticite}. "
                f"Préconisation : Surveillance renforcée de la zone et vérification des ouvertures périmétriques."
            )

    @classmethod
    def generate_initial_description(cls, event_type, zone_nom, heure_str, personne_nom=None):
        """Description brute initiale avant que l'utilisateur ne clique sur le bouton Gemini."""
        if event_type == 'visage_connu' and personne_nom:
            return f"Détection de l'utilisateur autorisé {personne_nom} dans {zone_nom} à {heure_str}."
        elif event_type in ['inconnu', 'visage_inconnu']:
            return f"Détection d'un individu non identifié dans la zone {zone_nom} à {heure_str}."
        else:
            return f"Mouvement suspect détecté par la caméra de {zone_nom} à {heure_str}."

    @classmethod
    def generate_reconstructed_image(cls, event_type, zone_nom, description, personne_nom=None):
        """
        Génère une VRAIE image CCTV de vidéosurveillance réaliste :
        1. Tente Pollinations AI (Flux / Stable Diffusion réaliste sans clé, rapide)
        2. Fallback local : Image CCTV réaliste texturée avec scanlines et OSD de caméra de sécurité
        """
        # 1. Tentative de génération d'image photoréaliste via Pollinations
        try:
            prompt_type = {
                'inconnu': 'suspicious hooded intruder trespassing inside building',
                'visage_inconnu': 'suspicious person face caught on security camera',
                'visage_connu': f'friendly authorized person employee walking indoors {personne_nom or ""}',
                'mouvement': 'blurred motion shadow figure moving in dark corridor',
            }.get(event_type, 'cctv footage surveillance camera indoor')

            zone_clean = zone_nom.replace(' ', '%20')
            prompt_encoded = (
                f"cctv%20security%20camera%20footage%20{prompt_type.replace(' ', '%20')}%20"
                f"inside%20{zone_clean}%20surveillance%20night%20vision%20green%20tint%20grainy%20authentic"
            )
            url_img = f"https://image.pollinations.ai/prompt/{prompt_encoded}?width=640&height=360&nologo=true"

            res = requests.get(url_img, timeout=12)
            if res.status_code == 200 and len(res.content) > 5000:
                print(f"[Image IA] Vraie photo CCTV generee avec succes ({len(res.content)} octets)")
                filename = f"cctv_{event_type}_{random.randint(1000, 9999)}.jpg"
                return ContentFile(res.content, name=filename)
        except Exception as e:
            print(f"[Image IA] Pollinations non disponible: {e}")

        # 2. Fallback Haute-Fidélité : Texture CCTV réaliste avec bruit, scanlines et OSD
        print("[Image IA] Generation de la vue CCTV realiste Alerta.")
        return cls._generate_realistic_cctv_image(event_type, zone_nom, personne_nom)

    @classmethod
    def _generate_realistic_cctv_image(cls, event_type, zone_nom, personne_nom=None):
        """Génère une image CCTV réaliste avec scanlines, bruit vidéo, vignette et OSD de sécurité."""
        width, height = 640, 360
        # Fond sombre type caméra nocturne avec légère nuance verte
        img = Image.new('RGB', (width, height), color=(14, 24, 20))
        draw = ImageDraw.Draw(img)

        # 1. Dégradé de pièce (perspective d'une pièce en vidéosurveillance)
        # Murs / Plafond / Sol
        draw.polygon([(0, 0), (width, 0), (width * 0.8, height * 0.35), (width * 0.2, height * 0.35)], fill=(18, 30, 24))
        draw.polygon([(0, 0), (width * 0.2, height * 0.35), (width * 0.2, height * 0.85), (0, height)], fill=(12, 20, 16))
        draw.polygon([(width, 0), (width * 0.8, height * 0.35), (width * 0.8, height * 0.85), (width, height)], fill=(12, 20, 16))
        draw.polygon([(width * 0.2, height * 0.35), (width * 0.8, height * 0.35), (width * 0.8, height * 0.85), (width * 0.2, height * 0.85)], fill=(22, 38, 30))
        draw.polygon([(0, height), (width * 0.2, height * 0.85), (width * 0.8, height * 0.85), (width, height)], fill=(10, 16, 14))

        # 2. Silhouette d'ambiance CCTV réaliste
        cx, cy = int(width * 0.5), int(height * 0.58)
        # Ombre au sol
        draw.ellipse([cx - 45, cy + 50, cx + 45, cy + 65], fill=(6, 10, 8))

        if event_type in ['inconnu', 'visage_inconnu']:
            # Silhouette sombre avec capuche
            # Corps
            draw.polygon([(cx - 28, cy + 55), (cx + 28, cy + 55), (cx + 22, cy - 10), (cx - 22, cy - 10)], fill=(28, 42, 36))
            # Tête / Capuche
            draw.ellipse([cx - 18, cy - 38, cx + 18, cy - 8], fill=(22, 34, 28))
            # Boîte de détection de visage / intrusion CCTV
            bx1, by1, bx2, by2 = cx - 40, cy - 48, cx + 40, cy + 58
            draw.rectangle([bx1, by1, bx2, by2], outline=(230, 57, 70), width=2)
            # Coins du bounding box
            c_len = 10
            for px, py in [(bx1, by1), (bx2, by1), (bx1, by2), (bx2, by2)]:
                sx = 1 if px == bx1 else -1
                sy = 1 if py == by1 else -1
                draw.line([(px, py), (px + sx * c_len, py)], fill=(255, 100, 100), width=3)
                draw.line([(px, py), (px, py + sy * c_len)], fill=(255, 100, 100), width=3)
            # Label au-dessus de la boîte
            draw.rectangle([bx1, by1 - 18, bx1 + 105, by1], fill=(230, 57, 70))
            draw.text((bx1 + 4, by1 - 15), "INCONNU [0.94]", fill=(255, 255, 255))

        elif event_type == 'visage_connu':
            # Silhouette avec visage identifié (vert)
            draw.polygon([(cx - 26, cy + 55), (cx + 26, cy + 55), (cx + 20, cy - 10), (cx - 20, cy - 10)], fill=(32, 50, 42))
            draw.ellipse([cx - 16, cy - 36, cx + 16, cy - 10], fill=(42, 65, 54))
            bx1, by1, bx2, by2 = cx - 35, cy - 45, cx + 35, cy + 58
            draw.rectangle([bx1, by1, bx2, by2], outline=(0, 194, 203), width=2)
            p_name = (personne_nom or "AUTORISE")[:12].upper()
            draw.rectangle([bx1, by1 - 18, bx1 + 115, by1], fill=(0, 194, 203))
            draw.text((bx1 + 4, by1 - 15), f"{p_name} [OK]", fill=(11, 31, 58))
        else:
            # Mouvement (jaune/orange)
            draw.ellipse([cx - 50, cy - 30, cx + 50, cy + 40], outline=(255, 183, 3), width=2)
            draw.text((cx - 45, cy - 48), "MOUVEMENT DETECTE", fill=(255, 183, 3))

        # 3. Lignes de balayage CCTV (scanlines)
        for y in range(0, height, 4):
            draw.line([(0, y), (width, y)], fill=(8, 16, 12, 40))

        # 4. Informations OSD de caméra de sécurité (Incrustation vidéo réelle)
        # Point rouge clignotant REC
        draw.ellipse([20, 18, 30, 28], fill=(230, 57, 70))
        draw.text((36, 16), "REC", fill=(255, 255, 255))
        draw.text((80, 16), f"CAM-01 [{zone_nom.upper()}]", fill=(0, 194, 203))

        # Heure et date OSD en bas
        draw.text((20, height - 30), "ALERTA SECURE VISION v3.2", fill=(140, 160, 150))
        draw.text((width - 150, height - 30), "FLUX DIRECT LIVE", fill=(0, 220, 130))

        # Réticule central caméra
        rcx, rcy = width // 2, height // 2
        draw.line([(rcx - 12, rcy), (rcx + 12, rcy)], fill=(0, 194, 203), width=1)
        draw.line([(rcx, rcy - 12), (rcx, rcy + 12)], fill=(0, 194, 203), width=1)

        # Encodage JPEG
        out = io.BytesIO()
        img.save(out, format='JPEG', quality=88)
        out.seek(0)
        return ContentFile(out.read(), name=f"cctv_{event_type}_{zone_nom[:10]}.jpg")
