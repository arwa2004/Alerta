import os
import math
import joblib
from datetime import datetime

# Chemin vers le fichier modèle sérialisé
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'criticite_model.joblib')

class CriticitePredictor:
    """
    Moteur de prédiction de criticité des événements Alerta (Module 3).
    Utilise un modèle Machine Learning entraîné sur des facteurs spatio-temporels
    et biométriques pour classifier la gravité de l'événement.
    """
    def __init__(self):
        self.model = None
        self._load_model()

    def _load_model(self):
        if os.path.exists(MODEL_PATH):
            try:
                self.model = joblib.load(MODEL_PATH)
            except Exception as e:
                print(f"[ML Predictor] Avertissement: Impossible de charger le modèle ({e}). Utilisation des poids calibrés.")
                self.model = None

    def _extract_features(self, evenement_data, recent_events_count=0):
        """
        Extrait les 6 descripteurs clés (features) de l'événement :
        1. heure : heure dans la journée (0 - 23)
        2. is_nuit : 1 si détection nocturne (22h - 06h), 0 sinon
        3. type_code : 0 = visage_connu, 1 = mouvement, 2 = inconnu
        4. is_inconnu : 1 si individu non identifié, 0 si connu
        5. score_confiance : indice de confiance faciale (0.0 - 1.0)
        6. recent_events_count : fréquence d'activité récente dans la zone (dernière heure)
        """
        date_heure = evenement_data.get('date_heure')
        if isinstance(date_heure, str):
            try:
                date_heure = datetime.fromisoformat(date_heure)
            except Exception:
                date_heure = datetime.now()
        elif not date_heure:
            date_heure = datetime.now()

        heure = date_heure.hour
        is_nuit = 1 if (heure >= 22 or heure <= 6) else 0

        type_str = evenement_data.get('type', 'mouvement')
        if type_str == 'visage_connu':
            type_code = 0
            is_inconnu = 0
        elif type_str == 'inconnu':
            type_code = 2
            is_inconnu = 1
        else: # mouvement
            type_code = 1
            is_inconnu = 1 if not evenement_data.get('personne_nom') else 0

        score_confiance = float(evenement_data.get('score_confiance', 0.85))
        recent_count = int(recent_events_count)

        return [heure, is_nuit, type_code, is_inconnu, score_confiance, recent_count]

    def predict(self, evenement_data, recent_events_count=0):
        """
        Calcule le score de criticité (0.00 à 1.00) et le niveau ('faible', 'moyen', 'eleve').
        Déclenche également le statut d'alerte pour le Module 4.
        """
        features = self._extract_features(evenement_data, recent_events_count)

        # Si le modèle scikit-learn est chargé
        if self.model is not None:
            try:
                # Prédiction de la probabilité de la classe critique
                proba = self.model.predict_proba([features])[0]
                # Si le modèle a 2 ou 3 classes, on extrait la composante haute criticité
                if len(proba) == 2:
                    score = float(proba[1])
                elif len(proba) == 3:
                    score = float(proba[1] * 0.5 + proba[2] * 1.0)
                else:
                    score = float(proba[-1])
            except Exception:
                score = self._heuristic_fallback(features)
        else:
            score = self._heuristic_fallback(features)

        # Normalisation entre 0.0 et 1.0
        score = max(0.0, min(1.0, round(score, 2)))

        # Détermination du niveau
        if score >= 0.70:
            niveau = 'eleve'
            declencher_alerte = True
        elif score >= 0.35:
            niveau = 'moyen'
            declencher_alerte = (features[3] == 1) # Alerte si personne inconnue
        else:
            niveau = 'faible'
            declencher_alerte = False

        return {
            'score_criticite': score,
            'niveau_criticite': niveau,
            'alerte_declenchee': declencher_alerte,
            'features': features,
        }

    def _heuristic_fallback(self, features):
        """
        Modèle de régression logistique calibré avec poids mathématiques stricts
        assurant un résultat exact et déterministe même sans fichier binaire chargé.
        """
        heure, is_nuit, type_code, is_inconnu, score_confiance, recent_count = features

        # Poids calibrés
        # Biais de départ modéré
        logit = -1.8

        # Effet nuit : intrusion nocturne très critique (+1.6)
        if is_nuit:
            logit += 1.6

        # Type d'événement :
        # - visage connu : -1.5 (très rassurant)
        # - mouvement : +0.6
        # - personne inconnue : +2.1 (alerte prioritaire)
        if type_code == 0:
            logit -= 1.5
        elif type_code == 1:
            logit += 0.6
        elif type_code == 2:
            logit += 2.2

        # Individu non identifié
        if is_inconnu and type_code != 2:
            logit += 1.0

        # Répétition d'activité anormale dans la zone
        if recent_count >= 3:
            logit += min(recent_count * 0.25, 1.2)

        # Calcul sigmoïde
        proba = 1.0 / (1.0 + math.exp(-logit))
        return proba

# Instance singleton réutilisable
predictor = CriticitePredictor()
