from datetime import timedelta
from django.utils import timezone
from .models import Evenement, Zone
from .ml.predictor import predictor
from .ai import AlertaAIService


def declencher_alerte_module_4(evenement, gravite):
    """
    Interface avec le Module 4 (Voix, alertes et alarme).
    Appelée lorsqu'un événement est critique ou concerne un individu inconnu.
    """
    print(f"[ALERTE MODULE 4 DECLENCHEE] Gravité: {gravite.upper()} | Événement ID #{evenement.id} - {evenement}")
    return True


def analyser_evenement_gemini(evenement):
    """
    Déclenché explicitement par le bouton de l'utilisateur.
    Génère une analyse experte approfondie via Google Gemini et persiste sur l'événement.
    """
    zone_nom = evenement.zone.nom if evenement.zone else evenement.zone_nom_fallback
    heure_str = evenement.date_heure.strftime('%H:%M:%S')

    analyse = AlertaAIService.generate_gemini_analysis(
        event_type=evenement.type,
        zone_nom=zone_nom,
        heure_str=heure_str,
        score_criticite=evenement.niveau_criticite,
        score_confiance=evenement.score_confiance,
        personne_nom=evenement.personne_nom
    )

    evenement.description = analyse
    evenement.save(update_fields=['description'])
    return evenement


def creer_evenement(
    user,
    type_event='mouvement',
    zone=None,
    zone_nom_fallback='Entrée Principale',
    personne_nom='',
    score_confiance=0.85,
    date_heure=None
):
    """
    Point d'entrée de service pour le Module 2 (Médias & Vidéos) et pour l'API.
    Traite la détection, calcule le score de criticité ML, génère l'image CCTV et persiste l'événement.
    La description initiale est synthétique, et l'analyse Gemini est générable via le bouton.
    """
    if date_heure is None:
        date_heure = timezone.now()

    zone_nom = zone.nom if zone else zone_nom_fallback

    # 1. Calcul du nombre d'événements récents dans la zone (dernière heure)
    une_heure_avant = date_heure - timedelta(hours=1)
    if zone:
        recent_count = Evenement.objects.filter(
            user=user,
            zone=zone,
            date_heure__gte=une_heure_avant
        ).count()
    else:
        recent_count = Evenement.objects.filter(
            user=user,
            zone_nom_fallback=zone_nom_fallback,
            date_heure__gte=une_heure_avant
        ).count()

    # 2. Calcul du score de criticité par Machine Learning (scikit-learn)
    event_data_for_ml = {
        'date_heure': date_heure,
        'type': type_event,
        'personne_nom': personne_nom,
        'score_confiance': score_confiance,
    }
    ml_result = predictor.predict(event_data_for_ml, recent_events_count=recent_count)
    score_criticite = ml_result['score_criticite']
    niveau_criticite = ml_result['niveau_criticite']
    declencher_alerte = ml_result['alerte_declenchee']

    # 3. Description initiale (l'analyse complète Gemini se fait ensuite via le bouton)
    heure_str = date_heure.strftime('%H:%M:%S')
    description = AlertaAIService.generate_initial_description(
        event_type=type_event,
        zone_nom=zone_nom,
        heure_str=heure_str,
        personne_nom=personne_nom
    )

    # 4. Génération de l'image réaliste de vidéosurveillance CCTV
    try:
        image_file = AlertaAIService.generate_reconstructed_image(
            event_type=type_event,
            zone_nom=zone_nom,
            description=description,
            personne_nom=personne_nom
        )
    except Exception as e:
        print(f"[Erreur IA Image] {e}")
        image_file = None

    # 5. Création et persistance de l'événement en base
    evenement = Evenement.objects.create(
        user=user,
        zone=zone,
        zone_nom_fallback=zone_nom_fallback,
        type=type_event,
        personne_nom=personne_nom,
        description=description,
        date_heure=date_heure,
        score_confiance=score_confiance,
        score_criticite=score_criticite,
        niveau_criticite=niveau_criticite,
        alerte_declenchee=declencher_alerte,
        statut_ia='ok'
    )

    if image_file:
        evenement.image_reconstituee = image_file
        evenement.save(update_fields=['image_reconstituee'])

    # 6. Déclenchement de l'alerte pour le Module 4 si nécessaire
    if declencher_alerte or niveau_criticite in ['critique', 'elevee']:
        declencher_alerte_module_4(evenement, niveau_criticite)

    return evenement
