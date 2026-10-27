from datetime import timedelta
from django.utils import timezone
from .models import Evenement, Zone
from .ai import AlertaAIService


def declencher_alerte_module_4(evenement, gravite):
    """
    Interface avec le Module 4 (Voix, alertes et alarme).
    Appelée lorsqu'un événement est critique ou concerne un individu inconnu.
    """
    print(f"[ALERTE MODULE 4 DECLENCHEE] Gravité: {gravite.upper()} | Événement ID #{evenement.id} - {evenement}")
    return True


def evaluer_criticite(type_event, score_confiance=0.85):
    """
    Évaluation déterministe et transparente du niveau de risque :
    - Inconnu : Criticité élevée (0.85) -> déclenche l'alarme Module 4
    - Mouvement : Criticité moyenne (0.50) -> vigilance
    - Visage connu : Criticité faible (0.15) -> accès normal autorisé
    """
    if type_event in ['inconnu', 'visage_inconnu']:
        return {
            'score_criticite': 0.85,
            'niveau_criticite': 'eleve',
            'alerte_declenchee': True,
        }
    elif type_event == 'mouvement':
        return {
            'score_criticite': 0.50,
            'niveau_criticite': 'moyen',
            'alerte_declenchee': False,
        }
    else:  # visage_connu
        return {
            'score_criticite': 0.15,
            'niveau_criticite': 'faible',
            'alerte_declenchee': False,
        }


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
    Traite la détection, évalue la gravité, reconstitue la scène via Hugging Face et persiste l'événement.
    """
    if date_heure is None:
        date_heure = timezone.now()

    zone_nom = zone.nom if zone else zone_nom_fallback

    # 1. Évaluation de la gravité
    evaluation = evaluer_criticite(type_event, score_confiance)
    score_criticite = evaluation['score_criticite']
    niveau_criticite = evaluation['niveau_criticite']
    declencher_alerte = evaluation['alerte_declenchee']

    # 2. Description initiale (l'analyse complète Gemini se fait ensuite via le bouton)
    heure_str = date_heure.strftime('%H:%M:%S')
    description = AlertaAIService.generate_initial_description(
        event_type=type_event,
        zone_nom=zone_nom,
        heure_str=heure_str,
        personne_nom=personne_nom
    )

    # 3. Création de l'événement en base de données
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
        image_source='simulation',
        statut_ia='ok'
    )

    # 4. Reconstitution visuelle par IA (Hugging Face ou fallback simulation)
    try:
        AlertaAIService.generer_image_reconstitution(evenement)
    except Exception as e:
        print(f"[Erreur Reconstitution Image] {e}")

    # 5. Déclenchement de l'alerte pour le Module 4 si nécessaire
    if declencher_alerte or niveau_criticite in ['critique', 'eleve']:
        declencher_alerte_module_4(evenement, niveau_criticite)

    return evenement
