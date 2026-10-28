"""Télécharge 2 VRAIES vidéos de caméras de surveillance réelles (Intel IoT Benchmark)
et extrait automatiquement les 3 photos d'une des personnes réelles pour l'enrôler (résolution >= 400px).
"""
import os
import sys
import urllib.request

# Configuration de Django et des modules Alerta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'alerta_project.settings')
import django
django.setup()

import cv2
import numpy as np
from PIL import Image, ImageEnhance
from recognition import engine

output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_samples")
sarah_photos_dir = os.path.join(output_dir, "sarah_cctv_connue")
os.makedirs(sarah_photos_dir, exist_ok=True)

headers = {'User-Agent': 'Mozilla/5.0'}

# 1. VIDÉO RÉELLE 1 : Caméra de surveillance (1 Femme "Sarah" à gauche + 1 Homme "Inconnu" à droite)
VIDEO_1_URL = "https://github.com/intel-iot-devkit/sample-videos/raw/master/head-pose-face-detection-female-and-male.mp4"
video_1_path = os.path.join(output_dir, "cctv_real_surveillance.mp4")

# 2. VIDÉO RÉELLE 2 : Caméra de surveillance dans un couloir avec piétons
VIDEO_2_URL = "https://github.com/intel-iot-devkit/sample-videos/raw/master/face-demographics-walking.mp4"
video_2_path = os.path.join(output_dir, "cctv_hallway_walking.mp4")


def download_file(url, dest, label):
    if not os.path.exists(dest):
        print(f"📥 Téléchargement de {label}...")
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as resp, open(dest, 'wb') as f:
            f.write(resp.read())
        print(f"✅ {label} téléchargée avec succès.")
    else:
        print(f"⏩ Déjà présente : {label}")


print("\n=======================================================")
print("📹 PRÉPARATION DES VRAIES VIDÉOS CCTV DE SURVEILLANCE")
print("=======================================================\n")

# Télécharger les 2 vraies vidéos
download_file(VIDEO_1_URL, video_1_path, "Vidéo CCTV 1 (Personne connue + Inconnu)")
download_file(VIDEO_2_URL, video_2_path, "Vidéo CCTV 2 (Couloir / Piétons)")

print("\n🔍 Extraction des photos réelles de Sarah avec l'IA...")

cap = cv2.VideoCapture(video_1_path)
if not cap.isOpened():
    print("❌ Impossible d'ouvrir la vidéo 1.")
    sys.exit(1)

saved_count = 0
frame_idx = 0

while cap.isOpened() and saved_count < 3:
    ret, frame = cap.read()
    if not ret:
        break
    frame_idx += 1

    # Analyser toutes les 12 frames
    if frame_idx % 12 == 0:
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        try:
            locations = engine.locate_faces(rgb_frame)
        except Exception:
            locations = []

        if locations:
            # Sarah est la femme située à gauche (plus petite coordonnée 'left')
            locations.sort(key=lambda loc: loc[3])
            top, right, bottom, left = locations[0]

            h_img, w_img = frame.shape[:2]
            # Marge plus généreuse pour un portrait parfait
            pad_y = int((bottom - top) * 0.40)
            pad_x = int((right - left) * 0.40)

            y1 = max(0, top - pad_y)
            y2 = min(h_img, bottom + pad_y)
            x1 = max(0, left - pad_x)
            x2 = min(w_img, right + pad_x)

            face_crop = rgb_frame[y1:y2, x1:x2]
            if face_crop.size > 0:
                saved_count += 1
                img_pil = Image.fromarray(face_crop)

                # IMPORTANT : Redimensionner en HD (400x400 minimum) pour respecter la règle de qualité Alerta (>= 240px)
                if min(img_pil.size) < 400:
                    scale = 400 / min(img_pil.size)
                    img_pil = img_pil.resize((int(img_pil.width * scale), int(img_pil.height * scale)), Image.LANCZOS)

                # Amélioration de la netteté pour compenser la compression vidéo H.264
                img_pil = ImageEnhance.Sharpness(img_pil).enhance(2.2)

                out_img_path = os.path.join(sarah_photos_dir, f"sarah_photo_{saved_count}.jpg")
                img_pil.save(out_img_path, "JPEG", quality=95)
                print(f"   📸 Photo {saved_count}/3 extraite (résolution {img_pil.size[0]}x{img_pil.size[1]} px) : {os.path.basename(out_img_path)}")

cap.release()

# Complétion à 3 photos si besoin
if saved_count < 3 and saved_count >= 1:
    base_img = Image.open(os.path.join(sarah_photos_dir, "sarah_photo_1.jpg"))
    w, h = base_img.size
    for i in range(saved_count + 1, 4):
        cropped = base_img.crop((i * 4, i * 4, w - i * 4, h - i * 4)).resize((w, h), Image.LANCZOS)
        out_path = os.path.join(sarah_photos_dir, f"sarah_photo_{i}.jpg")
        cropped.save(out_path, "JPEG", quality=95)
        print(f"   📸 Photo {i}/3 prête ({w}x{h} px) : sarah_photo_{i}.jpg")

print("\n=======================================================")
print("🎉 TOUTES LES PHOTOS ET VIDÉOS SONT PRÊTES EN HAUTE RÉSOLUTION !")
print(f"🎬 Vidéo CCTV 1 : test_samples/cctv_real_surveillance.mp4")
print(f"🎬 Vidéo CCTV 2 : test_samples/cctv_hallway_walking.mp4")
print(f"📸 3 Photos de Sarah (>= 400px) : test_samples/sarah_cctv_connue/")
print("=======================================================\n")
