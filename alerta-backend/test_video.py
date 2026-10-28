"""Script de test vidéo pour le moteur de reconnaissance faciale Alerta.

Détecte les visages, identifie les personnes connues et signale les inconnus (alertes).
Enregistre automatiquement les snapshots des visages inconnus et une vidéo annotée.

Usage :
  python test_video.py --video "test_samples/video_test.avi"
  python test_video.py --zone "maison" --video "chemin/vers/video.mp4"
  python test_video.py --webcam
"""
import argparse
import os
import sys
import time
from datetime import datetime

# 1. Initialisation de l'environnement Django
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'alerta_project.settings')
import django
django.setup()

import cv2
import numpy as np
from recognition import engine, services
from recognition.models import Zone


def format_time(seconds: float) -> str:
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 10)
    return f"{mins:02d}:{secs:02d}.{millis}"


def run_video_recognition(zone_name: str = None, video_source = None, frame_skip: int = 4, save_output: bool = True):
    # 2. Récupération ou sélection de la zone
    if zone_name:
        try:
            zone = Zone.objects.get(name__iexact=zone_name.strip())
        except Zone.DoesNotExist:
            available = list(Zone.objects.values_list('name', flat=True))
            print(f"❌ Erreur : La zone '{zone_name}' n'existe pas.")
            print(f"👉 Zones disponibles dans votre base : {available or 'Aucune'}")
            return
    else:
        zone = Zone.objects.first()
        if not zone:
            print("❌ Aucune zone n'a été créée. Créez d'abord une zone dans l'interface web.")
            return
        print(f"ℹ️ Aucune zone spécifiée : sélection automatique de la zone '{zone.name}'.")

    print(f"\n=======================================================")
    print(f"🎯 ALERTA - SURVEILLANCE VIDÉO & DÉTECTION D'INCONNUS")
    print(f"📍 Zone : {zone.name} (Seuil d'alerte : {zone.threshold})")
    print(f"=======================================================")

    cap = cv2.VideoCapture(video_source)
    if not cap.isOpened():
        print(f"❌ Impossible d'ouvrir la vidéo : {video_source}")
        return

    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_sec = (total_frames / fps) if total_frames > 0 else 0

    print(f"📹 Résolution : {width}x{height} | Cadence : {int(fps)} FPS")
    if duration_sec > 0:
        print(f"⏱️ Durée : {int(duration_sec // 60)}m {int(duration_sec % 60)}s ({total_frames} frames)")
    print(f"⚡ Analyse IA : 1 frame toutes les {frame_skip} frames")
    print(f"👉 Appuyez sur la touche 'q' dans la fenêtre pour arrêter.\n")

    # Dossier pour les captures d'inconnus
    snapshots_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_samples", "unknown_alerts")
    os.makedirs(snapshots_dir, exist_ok=True)

    # Initialisation de la sauvegarde vidéo
    writer = None
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_samples", "result_annotated.mp4")
    if save_output and width > 0 and height > 0:
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    frame_count = 0
    unknown_count = 0
    cached_detections = []
    last_snapshot_time = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1
        current_time_sec = frame_count / fps
        time_str = format_time(current_time_sec)

        # Détection IA
        if frame_count % frame_skip == 0:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            locations = engine.locate_faces(rgb_frame)
            cached_detections = []

            for loc in locations:
                enc = engine.encode_face(rgb_frame, loc)
                match = services.identify_encoding(zone, enc)
                cached_detections.append((loc, match))

                # Log et alerte en console lors de la détection d'un inconnu
                if not match.is_known:
                    unknown_count += 1
                    print(f"[{time_str}] 🚨 ALERTE INCONNU DÉTECTÉ ! (Confiance: {match.confidence}%, Dist: {match.distance})")

                    # Sauvegarder un instantané (snapshot) de l'inconnu (max 1 par seconde)
                    if time.time() - last_snapshot_time > 1.0:
                        last_snapshot_time = time.time()
                        top, right, bottom, left = loc
                        face_crop = frame[max(0, top-20):min(height, bottom+20), max(0, left-20):min(width, right+20)]
                        if face_crop.size > 0:
                            snap_name = f"unknown_{int(current_time_sec)}s_{unknown_count}.jpg"
                            cv2.imwrite(os.path.join(snapshots_dir, snap_name), face_crop)
                else:
                    status_lbl = "SURVEILLÉ" if match.should_alert else "AUTORISÉ"
                    print(f"[{time_str}] ✅ {match.person.full_name} ({status_lbl}) - Confiance: {match.confidence}%")

        # Dessin visuel sur la frame
        has_unknown = False
        for (top, right, bottom, left), match in cached_detections:
            if match.is_known and not match.should_alert:
                color = (0, 200, 0)      # Vert
                label = f"{match.person.full_name} ({match.confidence}%)"
            elif match.is_known and match.should_alert:
                color = (0, 140, 255)    # Orange
                label = f"SURVEILLE: {match.person.full_name}"
            else:
                color = (0, 0, 240)      # Rouge éclatant pour inconnu
                label = f"INCONNU ({match.confidence}%)"
                has_unknown = True

            # Rectangle autour du visage
            cv2.rectangle(frame, (left, top), (right, bottom), color, 3)

            # Étiquette
            cv2.rectangle(frame, (left, bottom - 26), (right, bottom), color, cv2.FILLED)
            cv2.putText(frame, label, (left + 6, bottom - 7), cv2.FONT_HERSHEY_DUPLEX, 0.55, (255, 255, 255), 1)

        # Bandeau d'alerte en haut de la vidéo
        if has_unknown:
            cv2.rectangle(frame, (0, 0), (width, 42), (0, 0, 200), cv2.FILLED)
            cv2.putText(frame, f"ALERTE INTRUSION : VISAGE INCONNU DETECTE [{time_str}]", (20, 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
        else:
            cv2.rectangle(frame, (0, 0), (width, 36), (20, 20, 20), cv2.FILLED)
            cv2.putText(frame, f"Alerta - Zone: {zone.name} | Temps: {time_str}", (15, 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 220, 220), 2)

        # Enregistrement vidéo
        if writer is not None:
            writer.write(frame)

        # Affichage à l'écran
        cv2.imshow("Alerta - Video Detection", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            print("\nArrêt manuel par l'utilisateur.")
            break

    cap.release()
    if writer is not None:
        writer.release()
    cv2.destroyAllWindows()

    print("\n=======================================================")
    print("🏁 ANALYSE VIDÉO TERMINÉE")
    print(f"📊 Total alertes 'Visages Inconnus' : {unknown_count}")
    if os.path.exists(snapshots_dir) and os.listdir(snapshots_dir):
        print(f"📸 Instantanés des inconnus sauvegardés dans : {snapshots_dir}")
    if os.path.exists(output_path):
        print(f"🎬 Vidéo annotée enregistrée dans : {output_path}")
    print("=======================================================\n")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Détection de personnes connues et inconnues sur vidéo")
    parser.add_argument('--video', type=str, default=None, help="Chemin du fichier vidéo (ex: test_samples/video_test.avi)")
    parser.add_argument('--zone', type=str, default=None, help="Nom de la zone (optionnel, prend la première par défaut)")
    parser.add_argument('--webcam', action='store_true', help="Utiliser la webcam en direct")
    parser.add_argument('--skip', type=int, default=4, help="Analyser 1 image toutes les N frames (défaut: 4)")

    args = parser.parse_args()

    default_video = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_samples", "video_test.avi")
    source = 0 if args.webcam else (args.video or (default_video if os.path.exists(default_video) else None))

    if source is None:
        print("❌ Aucune source vidéo fournie. Utilisez --video chemin/vers/video.mp4 ou --webcam.")
        sys.exit(1)

    run_video_recognition(zone_name=args.zone, video_source=source, frame_skip=args.skip)
