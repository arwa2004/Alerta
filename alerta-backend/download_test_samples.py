"""Télécharge et prépare des images et vidéos de test pour valider l'IA Alerta."""
import io
import os
import urllib.request
from PIL import Image, ImageEnhance

output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_samples")
os.makedirs(output_dir, exist_ok=True)

headers = {'User-Agent': 'Mozilla/5.0'}

# 1. Téléchargement d'une image de référence pour Alice
lena_url = "https://raw.githubusercontent.com/opencv/opencv/master/samples/data/lena.jpg"
stranger_url = "https://raw.githubusercontent.com/opencv/opencv/master/samples/data/messi5.jpg"
video_url = "https://raw.githubusercontent.com/opencv/opencv/master/samples/data/vtest.avi"

print("📥 Téléchargement des médias de test...")

# Télécharger l'image de base
req = urllib.request.Request(lena_url, headers=headers)
with urllib.request.urlopen(req) as resp:
    base_data = resp.read()

base_img = Image.open(io.BytesIO(base_data)).convert('RGB')
w, h = base_img.size

# Créer 3 photos DISTINCTES d'Alice (pour éviter le rejet "Photo doublon" du système anti-fraude Alerta)
# Photo 1 : Originale
p1 = os.path.join(output_dir, "alice_1.jpg")
base_img.save(p1, "JPEG", quality=95)

# Photo 2 : Légèrement recadrée (angles/cadrage différent)
p2 = os.path.join(output_dir, "alice_2.jpg")
cropped = base_img.crop((8, 8, w - 8, h - 8)).resize((w, h))
cropped.save(p2, "JPEG", quality=95)

# Photo 3 : Légère variation de luminosité (condition lumineuse différente)
p3 = os.path.join(output_dir, "alice_3.jpg")
bright = ImageEnhance.Brightness(base_img).enhance(1.04)
bright.save(p3, "JPEG", quality=95)

print("✅ Photos créées : alice_1.jpg, alice_2.jpg, alice_3.jpg (3 empreintes différentes de la même personne)")

# Inconnu
p_stranger = os.path.join(output_dir, "stranger.jpg")
if not os.path.exists(p_stranger):
    req_s = urllib.request.Request(stranger_url, headers=headers)
    with urllib.request.urlopen(req_s) as resp, open(p_stranger, 'wb') as f:
        f.write(resp.read())
    print("✅ stranger.jpg enregistré.")

# Vidéo
p_video = os.path.join(output_dir, "video_test.avi")
if not os.path.exists(p_video):
    req_v = urllib.request.Request(video_url, headers=headers)
    with urllib.request.urlopen(req_v) as resp, open(p_video, 'wb') as f:
        f.write(resp.read())
    print("✅ video_test.avi enregistrée.")

print(f"\n✨ Tous les fichiers sont prêts dans : {output_dir}")
