import os
import random
import numpy as np

def generate_synthetic_dataset(n_samples=1500, random_state=42):
    """
    Génère un jeu de données synthétique réaliste d'événements de surveillance Alerta.
    Features:
      0: heure (0 - 23)
      1: is_nuit (0 ou 1)
      2: type_code (0: visage_connu, 1: mouvement, 2: inconnu)
      3: is_inconnu (0 ou 1)
      4: score_confiance (0.50 - 0.99)
      5: recent_events_count (0 - 8)
    Label y:
      0: faible
      1: moyen
      2: eleve
    """
    rng = np.random.RandomState(random_state)
    X = []
    y = []

    for _ in range(n_samples):
        heure = rng.randint(0, 24)
        is_nuit = 1 if (heure >= 22 or heure <= 6) else 0

        # Distribution réaliste des événements
        type_choice = rng.choice([0, 1, 2], p=[0.45, 0.30, 0.25])
        if type_choice == 0:  # visage connu
            is_inconnu = 0
            score_confiance = round(float(rng.uniform(0.75, 0.99)), 2)
        elif type_choice == 1:  # mouvement
            is_inconnu = rng.choice([0, 1], p=[0.5, 0.5])
            score_confiance = round(float(rng.uniform(0.50, 0.85)), 2)
        else:  # inconnu
            is_inconnu = 1
            score_confiance = round(float(rng.uniform(0.60, 0.95)), 2)

        recent_events = int(rng.poisson(lam=1.2))
        recent_events = min(recent_events, 8)

        # Règle de décision probabiliste avec bruit
        score = 0.0
        if is_nuit:
            score += 0.30
        if type_choice == 2:  # inconnu
            score += 0.45
        elif type_choice == 1:  # mouvement
            score += 0.20
        else:  # visage connu
            score -= 0.25

        if recent_events >= 3:
            score += 0.20

        # Bruit gaussien (réalité terrain)
        score += rng.normal(0, 0.08)

        # Classification en 3 niveaux
        if score >= 0.50:
            label = 2  # eleve
        elif score >= 0.20:
            label = 1  # moyen
        else:
            label = 0  # faible

        X.append([heure, is_nuit, type_choice, is_inconnu, score_confiance, recent_events])
        y.append(label)

    return np.array(X), np.array(y)


def train_and_evaluate():
    """
    Entraîne le modèle Random Forest / Logistic Regression,
    évalue les performances et exporte le modèle joblib.
    """
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
    import joblib

    print("--- [ML] Entrainement du modele de Criticite Alerta (Module 3) ---")
    X, y = generate_synthetic_dataset(n_samples=2000, random_state=42)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    clf = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42)
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)

    print(f"\n[OK] Exactitude globale (Accuracy) : {acc * 100:.2f}%")
    print("\n--- [Matrice de Confusion] ---")
    print(confusion_matrix(y_test, y_pred))

    print("\n--- [Rapport de Classification Detaille] ---")
    target_names = ['Faible (0)', 'Moyen (1)', 'Eleve (2)']
    print(classification_report(y_test, y_pred, target_names=target_names))

    print("\n--- [Importance des Features] ---")
    features_names = ['heure', 'is_nuit', 'type_code', 'is_inconnu', 'score_confiance', 'recent_events_count']
    for name, imp in zip(features_names, clf.feature_importances_):
        print(f"  - {name:<20}: {imp * 100:.2f}%")

    # Sauvegarde du modèle
    output_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(output_dir, 'criticite_model.joblib')
    joblib.dump(clf, model_path)
    print(f"\n[Sauvegarde] Modele serialise sauvegarde dans : {model_path}")
    return acc


if __name__ == '__main__':
    train_and_evaluate()
