"""Génère automatiquement :
1. Les 3 photos d'enrôlement pour la personne connue (Alice)
2. Une vidéo de test complète (demo_scenario.mp4)
"""
import io
import math
import os
import sys
import urllib.request
from PIL import Image, ImageEnhance

base_dir = os.path.dirname(os.path.abspath(__file__))
samples_dir = os.path.join(base_dir, "test_samples")
alice_dir = os.path.join(samples_dir, "alice_photos")
os.makedirs(alice_dir, exist_ok=True)

headers = {'User-Agent': 'Mozilla/5.0'}

print("🚀 1/3 Téléchargement des visages sources...")

def download_img(url):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return Image.open(io.BytesIO(resp.read())).convert('RGB')

# Visage 1 : Alice (Connue)
img_alice_raw = download_img("https://raw.githubusercontent.com/opencv/opencv/master/samples/data/lena.jpg")
# Visage 2 : Inconnu
img_stranger_raw = download_img("https://raw.githubusercontent.com/opencv/opencv/master/samples/data/messi5.jpg")

# 2. Sauvegarde des 3 photos d'enrôlement d'Alice (utilisant Pillow, 100% autonome)
print("📸 2/3 Création des 3 photos pour enrôler Alice...")
w, h = img_alice_raw.size

# Photo 1 : Originale
p1 = os.path.join(alice_dir, "alice_1.jpg")
img_alice_raw.save(p1, "JPEG", quality=95)

# Photo 2 : Recadrée
p2 = os.path.join(alice_dir, "alice_2.jpg")
img_alice_raw.crop((10, 10, w - 10, h - 10)).resize((w, h)).save(p2, "JPEG", quality=95)

# Photo 3 : Exposition
p3 = os.path.join(alice_dir, "alice_3.jpg")
ImageEnhance.Brightness(img_alice_raw).enhance(1.05).save(p3, "JPEG", quality=95)

print(f"✅ 3 photos d'Alice prêtes dans : {alice_dir}")

# Vérification d'OpenCV pour la création vidéo
try:
    import cv2
    import numpy as np
except ImportError:
    print("\n⚠️ OpenCV n'est pas encore installé pour générer la vidéo.")
    print("👉 Installez-le avec : python -m pip install opencv-python")
    print("👉 Puis relancez : python generate_test_scenario.py")
    sys.exit(0)

# 3. Génération de la vidéo réaliste
print("🎬 3/3 Génération de la vidéo de test (demo_scenario.mp4)...")

# Extraction des vignettes de visages carrés
face_alice = cv2.cvtColor(np.array(img_alice_raw), cv2.COLOR_RGB2BGR)
arr_stranger = cv2.cvtColor(np.array(img_stranger_raw), cv2.COLOR_RGB2BGR)
face_stranger = arr_stranger[50:150, 195:295]
if face_stranger.size == 0 or face_stranger.shape[0] < 50:
    face_stranger = cv2.resize(arr_stranger, (200, 200))
else:
    face_stranger = cv2.resize(face_stranger, (220, 220))

face_alice_resized = cv2.resize(face_alice, (220, 220))

# Paramètres vidéo
vid_w, vid_h = 1080, 720
fps = 25
duration_sec = 12
total_frames = fps * duration_sec

output_video = os.path.join(samples_dir, "demo_scenario.mp4")
fourcc = cv2.VideoWriter_fourcc(*'mp4v')
writer = cv2.VideoWriter(output_video, fourcc, fps, (vid_w, vid_h))

bg_base = np.zeros((vid_h, vid_w, 3), dtype=np.uint8)
for y in range(vid_h):
    c = int(45 + 35 * (y / vid_h))
    bg_base[y, :] = (c, c + 5, c + 10)

cv2.line(bg_base, (0, int(vid_h * 0.7)), (vid_w, int(vid_h * 0.7)), (70, 75, 80), 2)
cv2.line(bg_base, (int(vid_w * 0.3), 0), (int(vid_w * 0.2), vid_h), (60, 65, 70), 1)
cv2.line(bg_base, (int(vid_w * 0.7), 0), (int(vid_w * 0.8), vid_h), (60, 65, 70), 1)

def paste_face(frame, face_img, cx, cy):
    fh, fw = face_img.shape[:2]
    x1 = int(cx - fw / 2)
    y1 = int(cy - fh / 2)
    x2 = x1 + fw
    y2 = y1 + fh

    if x1 < 0 or y1 < 0 or x2 > vid_w or y2 > vid_h:
        return
    body_color = (60, 60, 60)
    cv2.ellipse(frame, (cx, y2 + 100), (int(fw * 0.9), 120), 0, 0, 180, body_color, -1)
    frame[y1:y2, x1:x2] = face_img

for f in range(total_frames):
    t = f / fps
    frame = bg_base.copy()

    cctv_time = f"CAM-01 [ENTREE]  2026-10-27  12:55:{int(t):02d}.{int((t%1)*100):02d}"
    cv2.putText(frame, cctv_time, (25, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2)

    # 0s - 4s : Alice
    if t < 4.0:
        progress = t / 4.0
        cx = int(220 + 150 * math.sin(progress * math.pi / 2))
        cy = int(340 + 15 * math.sin(t * 3))
        paste_face(frame, face_alice_resized, cx, cy)
        cv2.putText(frame, "SCENE 1 : PERSONNE CONNUE (ALICE)", (25, vid_h - 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 220, 0), 2)

    # 4s - 8s : Inconnu
    elif t < 8.0:
        progress = (t - 4.0) / 4.0
        cx = int(850 - 200 * math.sin(progress * math.pi / 2))
        cy = int(340 + 15 * math.sin(t * 3))
        paste_face(frame, face_stranger, cx, cy)
        cv2.putText(frame, "SCENE 2 : INTRUSION / PERSONNE INCONNUE", (25, vid_h - 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 240), 2)

    # 8s - 12s : Alice + Inconnu
    else:
        cx_a = 340 + int(20 * math.sin(t * 2))
        cy_a = 340 + int(10 * math.cos(t * 2))
        paste_face(frame, face_alice_resized, cx_a, cy_a)

        cx_s = 740 + int(25 * math.cos(t * 2))
        cy_s = 340 + int(10 * math.sin(t * 2))
        paste_face(frame, face_stranger, cx_s, cy_s)

        cv2.putText(frame, "SCENE 3 : DEUX PERSONNES (1 CONNUE + 1 INCONNUE)", (25, vid_h - 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 255), 2)

    writer.write(frame)

writer.release()
print(f"✨ Vidéo générée avec succès : {output_video}")
print(f"📊 Durée : {duration_sec}s à {fps} FPS, résolution {vid_w}x{vid_h}")
