"""
Service de Reconnaissance Vocale & Contrôle d'Alarme (Module 4 - Voix & Alarme).
Intègre Whisper (Hugging Face) pour transcrire la voix de l'utilisateur
et exécuter les ordres de sécurité (activer/désactiver alarme, alerte urgence).
"""
import os
import re
import tempfile
import unicodedata
import base64
import requests
from django.conf import settings
from django.utils import timezone
from .models import AlarmeConfig, Evenement, Zone

try:
    from gradio_client import Client as GradioClient, handle_file
    GRADIO_AVAILABLE = True
except ImportError:
    GradioClient = None
    handle_file = None
    GRADIO_AVAILABLE = False


def normaliser_texte(texte):
    """Nettoie et normalise une chaîne de caractères (accents, casse, ponctuation)."""
    if not texte:
        return ""
    nfkd = unicodedata.normalize('NFKD', str(texte))
    sans_accents = u"".join([c for c in nfkd if not unicodedata.combining(c)])
    propre = re.sub(r'[^a-zA-Z0-9\s]', ' ', sans_accents.lower())
    return ' '.join(propre.split())


def transcrire_audio_whisper_hf(audio_bytes, suffix='.webm'):
    """
    Envoie le flux audio à l'espace officiel Hugging Face Whisper (openai/whisper).
    """
    if not GRADIO_AVAILABLE or not handle_file:
        raise RuntimeError("gradio_client non disponible.")

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(audio_bytes)
            temp_path = f.name

        client = GradioClient("openai/whisper", download_files=False)
        result = client.predict(
            inputs=handle_file(temp_path),
            task="transcribe",
            api_name="/predict"
        )
        if isinstance(result, str):
            return result.strip()
        elif isinstance(result, (list, tuple)) and len(result) > 0:
            return str(result[0]).strip()
        return str(result).strip()
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass


def transcrire_audio_gemini_rest(audio_bytes, mime_type='audio/webm'):
    """
    Repli multimodal via Gemini Flash REST API si Hugging Face est surchargé.
    """
    key = getattr(settings, 'GEMINI_API_KEY', '') or os.environ.get('GEMINI_API_KEY', '')
    if not key:
        raise ValueError("Clé Gemini non configurée.")

    b64 = base64.b64encode(audio_bytes).decode('utf-8')
    models = ['gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite']

    for m in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={key}"
        payload = {
            "contents": [{
                "parts": [
                    {
                        "text": (
                            "Tu es un module de reconnaissance vocale de sécurité Alerta. "
                            "Transcris fidèlement en français ce qui est prononcé dans cet audio. "
                            "Réponds UNIQUEMENT avec le texte transcrit exact, sans aucun commentaire."
                        )
                    },
                    {"inline_data": {"mime_type": mime_type, "data": b64}}
                ]
            }],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 60}
        }
        try:
            r = requests.post(url, json=payload, timeout=8)
            if r.status_code == 200:
                data = r.json()
                text = data['candidates'][0]['content']['parts'][0]['text'].strip()
                if text:
                    return text
        except Exception as e:
            print(f"[Gemini REST audio error on {m}]: {e}")
            continue

    raise RuntimeError("Échec de la transcription Gemini REST.")


def transcrire_audio(audio_bytes, mime_type='audio/webm', fallback_texte=''):
    """
    Orchestrateur multi-niveaux :
    1. Whisper Hugging Face
    2. Repli Gemini Multimodal
    3. Repli texte WebSpeech si fourni par le navigateur
    """
    suffix = '.webm'
    if 'wav' in mime_type:
        suffix = '.wav'
    elif 'mp3' in mime_type:
        suffix = '.mp3'
    elif 'ogg' in mime_type:
        suffix = '.ogg'

    # 1. Tentative Whisper Hugging Face
    try:
        texte = transcrire_audio_whisper_hf(audio_bytes, suffix=suffix)
        if texte and len(texte) > 1:
            return texte, 'whisper_huggingface'
    except Exception as e:
        print(f"[Whisper HF Exception]: {e}")

    # 2. Tentative Repli Gemini Audio REST
    try:
        texte = transcrire_audio_gemini_rest(audio_bytes, mime_type=mime_type)
        if texte and len(texte) > 1:
            return texte, 'gemini_audio'
    except Exception as e:
        print(f"[Gemini REST Audio Exception]: {e}")

    # 3. Repli sur le texte capturé en temps réel par le navigateur
    if fallback_texte and len(fallback_texte.strip()) > 1:
        return fallback_texte.strip(), 'web_speech_api'

    raise RuntimeError("Impossible de transcrire l'audio.")


def interpreter_et_executer_commande(user, texte_commande, source_ia='whisper_huggingface'):
    """
    Analyse sémantique de la commande vocale et exécution en temps réel.
    """
    config, _ = AlarmeConfig.objects.get_or_create(user=user)
    normalise = normaliser_texte(texte_commande)

    # 1. Mots-clés pour DÉSACTIVER l'alarme
    desactiver_kw = [
        'desactiver', 'desactive', 'couper', 'coupe', 'arret', 'arreter',
        'stop', 'silence', 'eteindre', 'eteins', 'desarmer', 'desarme',
        'annuler alarme', 'coupez', 'eteignez', 'eteint'
    ]

    # 2. Mots-clés pour ACTIVER l'alarme
    activer_kw = [
        'activer', 'active', 'allumer', 'allume', 'armer', 'arme',
        'enclencher', 'enclenche', 'surveillance', 'mettre en route',
        'securiser', 'proteger', 'activez', 'armez'
    ]

    # 3. Mots-clés pour DÉCLENCHER URGENCE / SOS / SIRÈNE
    urgence_kw = [
        'declencher', 'declenche', 'urgence', 'sos', 'intrusion', 'voleur',
        'danger', 'panique', 'au secours', 'alerte rouge', 'police', 'sirene'
    ]

    # 4. Mots-clés pour STATUT
    statut_kw = [
        'statut', 'etat', 'comment est', 'est ce que', 'situation', 'niveau'
    ]

    action = 'inconnu'
    action_label = 'Commande non reconnue'
    message_vocal = ""

    if any(k in normalise for k in desactiver_kw):
        action = 'alarme_desactivee'
        action_label = "Alarme désarmée"
        config.est_active = False
        config.est_declenchee = False
        config.save()
        # Clôture des alertes en cours
        Evenement.objects.filter(user=user, alerte_declenchee=True).update(alerte_declenchee=False)
        message_vocal = "Alarme désactivée avec succès. Le système est en veille."

    elif any(k in normalise for k in urgence_kw):
        action = 'alarme_declenchee_urgence'
        action_label = "Alerte d'urgence déclenchée"
        config.est_active = True
        config.est_declenchee = True
        config.save()

        # Création d'un événement d'alerte critique immédiat
        Evenement.objects.create(
            user=user,
            type='inconnu',
            zone_nom_fallback="Périmètre Général (Voix)",
            description=f"Alerte intrusion déclenchée manuellement par commande vocale : « {texte_commande} ».",
            description_source='simulation',
            score_criticite=0.95,
            niveau_criticite='eleve',
            alerte_declenchee=True,
            statut_ia='ok'
        )
        message_vocal = "Attention ! Alarme d'urgence déclenchée. Sirène activée."

    elif any(k in normalise for k in activer_kw):
        action = 'alarme_activee'
        action_label = "Alarme armée"
        config.est_active = True
        config.est_declenchee = False
        config.save()
        message_vocal = "Alarme activée. Le système Alerta est en surveillance renforcée."

    elif any(k in normalise for k in statut_kw):
        action = 'statut_consulte'
        action_label = "Consultation du statut"
        etat = "déclenchée en urgence" if config.est_declenchee else ("armée et active" if config.est_active else "désactivée")
        message_vocal = f"Le système d'alarme est actuellement {etat}."

    else:
        action = 'non_reconnu'
        action_label = "Commande non comprise"
        message_vocal = f"Commande « {texte_commande} » reçue. Dites « activer l'alarme » ou « désactiver l'alarme »."

    config.derniere_commande = str(texte_commande)[:250]
    config.derniere_action = action_label
    config.source_transcription = source_ia
    config.save(update_fields=['derniere_commande', 'derniere_action', 'source_transcription', 'updated_at'])

    return {
        'success': True,
        'transcription': texte_commande,
        'action': action,
        'action_label': action_label,
        'est_active': config.est_active,
        'est_declenchee': config.est_declenchee,
        'message_vocal': message_vocal,
        'source_ia': source_ia,
        'updated_at': config.updated_at.isoformat(),
    }
