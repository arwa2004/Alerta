from datetime import timedelta
from django.utils import timezone
from .models import Evenement, Zone
from .ai import AlertaAIService, decrire_photo_gemini


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


def analyser_evenement(ev):
    """
    Pipeline d'analyse IA propre (Point 1).
    - photo_capturee présente → Gemini Vision (image réelle), description_source='gemini_vision'
    - Sans photo → repli local honnête, description_source='simulation'
    Persiste description + description_source sur l'événement.
    """
    if ev.photo_capturee:
        try:
            ev.description = decrire_photo_gemini(ev)
            ev.description_source = 'gemini_vision'
        except Exception as exc:
            print(f"[Gemini Vision Fallback] {exc}")
            zone_nom = ev.zone.nom if ev.zone else ev.zone_nom_fallback
            heure_str = ev.date_heure.strftime('%H:%M:%S')
            ev.description = AlertaAIService._generate_scene_description(
                ev.type, zone_nom, heure_str, ev.personne_nom
            )
            ev.description_source = 'simulation'
    else:
        zone_nom = ev.zone.nom if ev.zone else ev.zone_nom_fallback
        heure_str = ev.date_heure.strftime('%H:%M:%S')
        ev.description = AlertaAIService._generate_scene_description(
            ev.type, zone_nom, heure_str, ev.personne_nom
        )
        ev.description_source = 'simulation'

    ev.save(update_fields=['description', 'description_source'])
    return ev


def analyser_evenement_gemini(evenement):
    """
    Alias maintenu pour compatibilité ascendante.
    Préférer analyser_evenement() dans le nouveau code.
    Déclenché explicitement par le bouton de l'utilisateur.
    - Si photo_capturee est présente : Gemini Vision (analyse visuelle de l'image réelle).
    - Sans photo : description factuelle transparente (étiquetée simulation ou synthèse texte).
    """
    zone_nom = evenement.zone.nom if evenement.zone else evenement.zone_nom_fallback
    heure_str = evenement.date_heure.strftime('%H:%M:%S')

    analyse, source = AlertaAIService.generate_gemini_analysis(
        event_type=evenement.type,
        zone_nom=zone_nom,
        heure_str=heure_str,
        score_criticite=evenement.niveau_criticite,
        score_confiance=evenement.score_confiance,
        personne_nom=evenement.personne_nom,
        photo_capturee=evenement.photo_capturee
    )

    evenement.description = analyse
    evenement.description_source = source
    evenement.save(update_fields=['description', 'description_source'])
    return evenement


def creer_evenement(
    user,
    type_event='mouvement',
    zone=None,
    zone_nom_fallback='Entrée Principale',
    personne_nom='',
    score_confiance=0.85,
    date_heure=None,
    photo_capturee=None
):
    """
    Point d'entrée de service pour le Module 2 (Médias & Vidéos) et pour l'API.
    Traite la détection, évalue la gravité, associe le média réel et persiste l'événement.
    """
    if date_heure is None:
        date_heure = timezone.now()

    zone_nom = zone.nom if zone else zone_nom_fallback

    # 1. Évaluation de la gravité
    evaluation = evaluer_criticite(type_event, score_confiance)
    score_criticite = evaluation['score_criticite']
    niveau_criticite = evaluation['niveau_criticite']
    declencher_alerte = evaluation['alerte_declenchee']

    # 2. Description initiale courte (l'analyse complète Gemini se fait ensuite via le bouton)
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
        description_source='simulation',
        photo_capturee=photo_capturee,
        date_heure=date_heure,
        score_confiance=score_confiance,
        score_criticite=score_criticite,
        niveau_criticite=niveau_criticite,
        alerte_declenchee=declencher_alerte,
        image_source='simulation',
        statut_ia='ok'
    )

    # 4. Génération du rendu visuel de simulation par défaut
    # L'image IA (FLUX.1) est générée UNIQUEMENT via le bouton "Générer l'image"
    # dans la modale, APRÈS que Gemini a produit la description de scène.
    try:
        AlertaAIService.generer_rendu_simulation(evenement)
        evenement.image_source = 'simulation'
        evenement.save(update_fields=['image_reconstituee', 'image_source'])
    except Exception as e:
        print(f"[Erreur Simulation Locale] {e}")

    # 5. Déclenchement de l'alerte pour le Module 4 si nécessaire
    if declencher_alerte or niveau_criticite in ['critique', 'eleve']:
        declencher_alerte_module_4(evenement, niveau_criticite)

    return evenement
