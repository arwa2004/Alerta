from datetime import timedelta
from django.utils import timezone
from .models import Evenement, Zone
from .ml.predictor import predictor
from .ai import AlertaAIService

def declencher_alerte_module_4(evenement, gravite):
    """
    Interface avec le Module 4 (Voix, alertes et alarme).
    Appelée lorsqu'un événement est critique ou concerne un individu inconnu.
    Prêt pour l'intégration de l'équipe.
    """
    print(f"[ALERTE MODULE 4 DECLENCHEE] Gravité: {gravite.upper()} | Événement ID #{evenement.id} - {evenement}")
    # Plus tard, le Module 4 pourra brancher ici son système de notification vocale / push / alarme
    return True


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
    Traite la détection, enrichit par IA, calcule le score de criticité ML et persiste l'événement.
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

    # 3. Génération de la description en français via Gemini
    try:
        description = AlertaAIService.generate_description(
            event_type=type_event,
            zone_nom=zone_nom,
            date_heure=date_heure,
            personne_nom=personne_nom,
            score_confiance=score_confiance
        )
        statut_ia = 'ok'
    except Exception as e:
        print(f"[Erreur IA Description] {e}")
        description = f"Détection de type {type_event} enregistrée dans {zone_nom}."
        statut_ia = 'erreur'

    # 4. Génération de l'image de reconstitution de la scène
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
        statut_ia = 'erreur'

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
        statut_ia=statut_ia,
        alerte_declenchee=declencher_alerte
    )

    if image_file:
        evenement.image_reconstituee.save(
            f"event_{evenement.id}_{type_event}.jpg",
            image_file,
            save=True
        )

    # 6. Déclenchement de l'alerte vers le Module 4 si criticité élevée ou inconnu
    if declencher_alerte:
        declencher_alerte_module_4(evenement, gravite=niveau_criticite)

    return evenement
