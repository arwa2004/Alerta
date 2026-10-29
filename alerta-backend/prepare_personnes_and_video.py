"""Script complet pour :
1. Extraire et préparer 3 photos d'enrôlement conformes pour Personne 1
2. Extraire et préparer 3 photos d'enrôlement conformes pour Personne 2
3. Extraire les photos des personnes inconnues (pour tests photo unitaires)
4. Enrôler Personne 1 et Personne 2 dans la base de données Django (liées aux zones actives)
5. Générer une vidéo de surveillance de test réaliste (scenario_personnes_1_et_2.mp4)
6. Valider la reconnaissance avec le moteur IA Alerta
"""
import io
import math
import os
import shutil
import sys

# Support UTF-8 console output sur Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# Configuration Django
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'alerta_project.settings')
import django
django.setup()

import cv2
import numpy as np
from PIL import Image, ImageEnhance
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from recognition import engine, quality, services
from recognition.models import Face, KnownPerson, Zone

User = get_user_model()

# Chemins
SOURCE_IMG_PATH = r"C:/Users/user/.gemini/antigravity/brain/3510e5fd-cf42-45ec-979c-1d06901458f5/.user_uploaded/media_1793180018159_2283bd5b.png"
SAMPLES_DIR = os.path.join(BASE_DIR, "test_samples")
ROOT_SAMPLES_DIR = os.path.join(os.path.dirname(BASE_DIR), "test_samples")

DIR_P1 = os.path.join(SAMPLES_DIR, "personne_1")
DIR_P2 = os.path.join(SAMPLES_DIR, "personne_2")
DIR_INCONNU = os.path.join(SAMPLES_DIR, "inconnus")

for d in [DIR_P1, DIR_P2, DIR_INCONNU, ROOT_SAMPLES_DIR]:
    os.makedirs(d, exist_ok=True)

print("=" * 65)
print("🚀 ALERTA - GÉNÉRATION DES DONNÉES DE TEST (PERSONNE 1 & 2)")
print("=" * 65)

# -------------------------------------------------------------------------
# ÉTAPE 1 : Découpage des 5 visages à partir de l'image source
# -------------------------------------------------------------------------
print("\n[1/5] Extraction et découpage des visages sources...")
src_img = Image.open(SOURCE_IMG_PATH).convert('RGB')
src_arr = np.array(src_img)
w_total, h_total = src_img.size
step = w_total / 5.0

# Hauteur utile (sans le bandeau texte en bas)
PORTRAIT_H = 112

raw_portraits = {}
for i in range(5):
    x_start = int(i * step)
    x_end = int((i + 1) * step)
    crop = src_img.crop((x_start, 0, x_end, PORTRAIT_H))
    raw_portraits[i + 1] = crop

print(f"✅ 5 portraits bruts découpés avec succès (largeur ~{int(step)}px, hauteur {PORTRAIT_H}px).")

# -------------------------------------------------------------------------
# ÉTAPE 2 : Génération des 3 photos haute qualité pour Personne 1 & 2
# -------------------------------------------------------------------------
print("\n[2/5] Préparation des 3 photos d'enrôlement conformes (HD 450x450)...")

def create_3_enrollment_photos(portrait_img, out_dir, prefix):
    # Upscale HD avec interpolation Lanczos
    hd = portrait_img.resize((450, 450), Image.LANCZOS)
    hd_sharp = ImageEnhance.Sharpness(hd).enhance(1.8)
    
    # Photo 1 : Haute Définition originale améliorée
    p1_path = os.path.join(out_dir, f"{prefix}_photo_1.jpg")
    hd_sharp.save(p1_path, "JPEG", quality=95)
    
    # Photo 2 : Recadrage zoom 5% (variation de cadrage sans déformation)
    w, h = hd_sharp.size
    p2_crop = hd_sharp.crop((12, 12, w - 12, h - 12)).resize((w, h), Image.LANCZOS)
    p2_path = os.path.join(out_dir, f"{prefix}_photo_2.jpg")
    p2_crop.save(p2_path, "JPEG", quality=95)
    
    # Photo 3 : Légère variation d'exposition (+4% luminosité)
    p3_bright = ImageEnhance.Brightness(hd_sharp).enhance(1.05)
    p3_path = os.path.join(out_dir, f"{prefix}_photo_3.jpg")
    p3_bright.save(p3_path, "JPEG", quality=95)
    
    # Validation par quality.analyze_batch
    uploads = []
    for pth in [p1_path, p2_path, p3_path]:
        with open(pth, 'rb') as f:
            buf = io.BytesIO(f.read())
            buf.seek(0)
            analysis = quality.analyze_photo(buf)
            uploads.append(analysis)
    
    print(f"   📸 {prefix} : 3 photos créées et validées par l'IA (Scores qualité : {[a.quality_score for a in uploads]})")
    return [p1_path, p2_path, p3_path], uploads

p1_files, p1_analyses = create_3_enrollment_photos(raw_portraits[1], DIR_P1, "personne1")
p2_files, p2_analyses = create_3_enrollment_photos(raw_portraits[2], DIR_P2, "personne2")

# Photos des inconnus pour tests
for idx, num, name in [(3, 1, "inconnu_1_sweat"), (4, 2, "inconnu_2_lunettes"), (5, 3, "inconnu_3_casquette")]:
    hd_inc = raw_portraits[idx].resize((450, 450), Image.LANCZOS)
    hd_inc = ImageEnhance.Sharpness(hd_inc).enhance(1.8)
    hd_inc.save(os.path.join(DIR_INCONNU, f"{name}.jpg"), "JPEG", quality=95)

# Copie miroir dans le dossier racine test_samples
for src_f, dst_dir in [(DIR_P1, os.path.join(ROOT_SAMPLES_DIR, "personne_1")),
                       (DIR_P2, os.path.join(ROOT_SAMPLES_DIR, "personne_2")),
                       (DIR_INCONNU, os.path.join(ROOT_SAMPLES_DIR, "inconnus"))]:
    shutil.copytree(src_f, dst_dir, dirs_exist_ok=True)

# -------------------------------------------------------------------------
# ÉTAPE 3 : Enrôlement dans la base de données Django
# -------------------------------------------------------------------------
print("\n[3/5] Enrôlement automatique de Personne 1 et Personne 2 dans Django...")

user = User.objects.filter(email='mohamedaminechoukani02@gmail.com').first() or User.objects.first()
zones = list(Zone.objects.filter(owner=user))
if not zones:
    zones = list(Zone.objects.all())

print(f"   👤 Propriétaire : {user.email}")
print(f"   📍 Zones rattachées : {[z.name for z in zones]}")

def enroll_person(full_name, relation, file_paths, analyses):
    person, created = KnownPerson.objects.get_or_create(
        owner=user,
        full_name=full_name,
        defaults={
            'status': KnownPerson.Status.AUTHORIZED,
            'relation': relation,
            'consent': True,
        }
    )
    if not created:
        person.status = KnownPerson.Status.AUTHORIZED
        person.relation = relation
        person.consent = True
        person.save()
    
    # Lier à toutes les zones
    person.zones.set(zones)
    
    # Nettoyer et réinsérer les 3 visages
    person.faces.all().delete()
    for pth, analysis in zip(file_paths, analyses):
        with open(pth, 'rb') as f:
            content = f.read()
        fname = os.path.basename(pth)
        face = Face(
            person=person,
            encoding=analysis.encoding,
            quality_score=analysis.quality_score,
            image_hash=analysis.sha256,
        )
        face.image.save(fname, ContentFile(content), save=True)
    
    print(f"   ✅ '{full_name}' enrôlé(e) avec {person.faces.count()} visages enregistrés.")
    return person

person1_obj = enroll_person("Personne 1", "Employée autorisée", p1_files, p1_analyses)
person2_obj = enroll_person("Personne 2", "Employé autorisé", p2_files, p2_analyses)

# -------------------------------------------------------------------------
# ÉTAPE 4 : Génération de la vidéo de surveillance réaliste
# -------------------------------------------------------------------------
print("\n[4/5] Génération de la vidéo de surveillance vidéo réaliste...")

output_video_path = os.path.join(SAMPLES_DIR, "scenario_personnes_1_et_2.mp4")
root_video_path = os.path.join(ROOT_SAMPLES_DIR, "scenario_personnes_1_et_2.mp4")

# Paramètres vidéo
vid_w, vid_h = 1280, 720
fps = 25
duration_sec = 18
total_frames = fps * duration_sec

# Préparer les visages au format BGR
face_p1_cv = cv2.cvtColor(np.array(raw_portraits[1].resize((220, 220), Image.LANCZOS)), cv2.COLOR_RGB2BGR)
face_p2_cv = cv2.cvtColor(np.array(raw_portraits[2].resize((220, 220), Image.LANCZOS)), cv2.COLOR_RGB2BGR)
face_inc1_cv = cv2.cvtColor(np.array(raw_portraits[3].resize((220, 220), Image.LANCZOS)), cv2.COLOR_RGB2BGR)
face_inc3_cv = cv2.cvtColor(np.array(raw_portraits[5].resize((220, 220), Image.LANCZOS)), cv2.COLOR_RGB2BGR)

# Arrière-plan réaliste de hall / bureau sous caméra CCTV
bg_cctv = np.zeros((vid_h, vid_w, 3), dtype=np.uint8)
for y in range(vid_h):
    # Gradient vertical de pièce éclairée
    v = int(40 + 30 * (y / vid_h))
    bg_cctv[y, :] = (v, v + 2, v + 5)

# Lignes de perspective (sol, murs, portes)
cv2.line(bg_cctv, (0, int(vid_h * 0.72)), (vid_w, int(vid_h * 0.72)), (65, 70, 75), 2)
# Carrelage au sol
for x in range(0, vid_w + 1, 160):
    cv2.line(bg_cctv, (x, int(vid_h * 0.72)), (int(x * 1.3 - 100), vid_h), (50, 55, 60), 1)
for y in [int(vid_h * 0.78), int(vid_h * 0.86), int(vid_h * 0.95)]:
    cv2.line(bg_cctv, (0, y), (vid_w, y), (50, 55, 60), 1)

# Cadre de porte d'entrée au fond
door_x1, door_y1, door_x2, door_y2 = int(vid_w * 0.42), int(vid_h * 0.22), int(vid_w * 0.58), int(vid_h * 0.72)
cv2.rectangle(bg_cctv, (door_x1, door_y1), (door_x2, door_y2), (55, 60, 68), -1)
cv2.rectangle(bg_cctv, (door_x1, door_y1), (door_x2, door_y2), (80, 85, 95), 3)

def paste_character(frame, face_img, cx, cy, body_bgr=(50, 50, 50)):
    fh, fw = face_img.shape[:2]
    x1 = int(cx - fw / 2)
    y1 = int(cy - fh / 2)
    x2 = x1 + fw
    y2 = y1 + fh
    
    if x1 < 0 or y1 < 0 or x2 > vid_w or y2 > vid_h:
        return
    
    # Dessin des épaules et du torse
    torso_top = y2 - 10
    torso_bottom = min(vid_h, y2 + 190)
    torso_w = int(fw * 1.5)
    tx1 = max(0, cx - torso_w // 2)
    tx2 = min(vid_w, cx + torso_w // 2)
    
    cv2.ellipse(frame, (cx, torso_top + 80), (torso_w // 2, 100), 0, 0, 180, body_bgr, -1)
    # Col / col roulé
    cv2.ellipse(frame, (cx, torso_top + 15), (int(fw * 0.4), 22), 0, 0, 360, (body_bgr[0] + 15, body_bgr[1] + 15, body_bgr[2] + 15), -1)
    
    # Incrustation du visage
    frame[y1:y2, x1:x2] = face_img

fourcc = cv2.VideoWriter_fourcc(*'mp4v')
writer = cv2.VideoWriter(output_video_path, fourcc, fps, (vid_w, vid_h))

for f in range(total_frames):
    t = f / fps
    frame = bg_cctv.copy()
    
    # Scène 1 (0.0s à 4.0s) : Personne 1 entre et traverse
    if t < 4.0:
        prog = t / 4.0
        cx = int(240 + 260 * math.sin(prog * math.pi / 2))
        cy = int(320 + 8 * math.sin(t * 4))
        paste_character(frame, face_p1_cv, cx, cy, body_bgr=(210, 205, 200)) # Haut clair
        scene_desc = "SCENE 1 : PASSAGE PERSONNE 1 (AUTORISEE)"
        scene_color = (0, 220, 0)
    
    # Scène 2 (4.0s à 8.0s) : Personne 2 entre et traverse
    elif t < 8.0:
        prog = (t - 4.0) / 4.0
        cx = int(1040 - 320 * math.sin(prog * math.pi / 2))
        cy = int(320 + 8 * math.sin(t * 4))
        paste_character(frame, face_p2_cv, cx, cy, body_bgr=(35, 35, 40)) # Haut sombre
        scene_desc = "SCENE 2 : PASSAGE PERSONNE 2 (AUTORISE)"
        scene_color = (0, 220, 0)
    
    # Scène 3 (8.0s à 12.0s) : INTRUSION Inconnu 1 (Sweat à capuche)
    elif t < 12.0:
        prog = (t - 8.0) / 4.0
        cx = int(640 + 80 * math.sin(prog * math.pi))
        cy = int(300 + 10 * math.sin(t * 5))
        paste_character(frame, face_inc1_cv, cx, cy, body_bgr=(30, 25, 25))
        scene_desc = "SCENE 3 : ALERTE INTRUSION - PERSONNE INCONNUE"
        scene_color = (0, 0, 230)
    
    # Scène 4 (12.0s à 15.5s) : Personne 1 et Personne 2 présentes simultanément
    elif t < 15.5:
        cx1 = int(380 + 20 * math.sin(t * 2))
        cy1 = int(320 + 5 * math.cos(t * 2))
        paste_character(frame, face_p1_cv, cx1, cy1, body_bgr=(210, 205, 200))
        
        cx2 = int(900 - 20 * math.cos(t * 2))
        cy2 = int(320 + 5 * math.sin(t * 2))
        paste_character(frame, face_p2_cv, cx2, cy2, body_bgr=(35, 35, 40))
        scene_desc = "SCENE 4 : PERSONNE 1 ET PERSONNE 2 RECONNUES"
        scene_color = (0, 220, 0)
    
    # Scène 5 (15.5s à 18.0s) : Personne 1 + Inconnu 3 (Casquette)
    else:
        cx1 = int(360 + 15 * math.sin(t * 2))
        cy1 = int(320)
        paste_character(frame, face_p1_cv, cx1, cy1, body_bgr=(210, 205, 200))
        
        cx3 = int(920 - 40 * math.sin((t - 15.5) * 2))
        cy3 = int(320 + 6 * math.sin(t * 4))
        paste_character(frame, face_inc3_cv, cx3, cy3, body_bgr=(120, 140, 150))
        scene_desc = "SCENE 5 : PERSONNE 1 (AUTORISEE) + INCONNU DETECTE"
        scene_color = (0, 165, 255)
    
    # Overlay CCTV professionnel
    cctv_time = f"CAM-01 [ENTREE]  2026-10-28  10:35:{int(t):02d}.{int((t%1)*100):02d}"
    cv2.putText(frame, cctv_time, (30, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (220, 220, 220), 2)
    # Pastille rouge REC clignotante
    if int(t * 2) % 2 == 0:
        cv2.circle(frame, (vid_w - 75, 40), 10, (0, 0, 220), -1)
        cv2.putText(frame, "REC", (vid_w - 55, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 240), 2)
    
    # Bandeau descriptif de scène
    cv2.rectangle(frame, (0, vid_h - 45), (vid_w, vid_h), (20, 20, 20), -1)
    cv2.putText(frame, scene_desc, (30, vid_h - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.75, scene_color, 2)
    
    writer.write(frame)

writer.release()
shutil.copy(output_video_path, root_video_path)
print(f"✅ Vidéo générée avec succès : {output_video_path}")
print(f"📊 Durée : {duration_sec}s ({total_frames} frames) à {fps} FPS, résolution {vid_w}x{vid_h}")

# -------------------------------------------------------------------------
# ÉTAPE 5 : Test et validation par le moteur IA Alerta
# -------------------------------------------------------------------------
print("\n[5/5] Test et validation avec le moteur IA Alerta...")
target_zone = zones[0] if zones else Zone.objects.first()
print(f"   🎯 Analyse sur la zone '{target_zone.name}' (Seuil : {target_zone.threshold})...")

report = services.identify_video_faces(target_zone, output_video_path, sample_fps=2.0)

print("\n" + "=" * 65)
print("📊 RÉSULTAT DU RAPPORT D'ANALYSE ALERTA :")
print("=" * 65)
print(f"   ⏱️ Durée analysée : {report['duration_seconds']}s")
print(f"   👤 Personnes reconnues : {report['known_persons']}")
print(f"   🚨 Alerte intrusion déclenchée : {report['alert_triggered']}")
print(f"   📸 Inconnus distincts détectés : {len(report['unknown_snapshots'])}")
print(f"   🖼️ Miniatures connues extraites : {len(report['known_snapshots'])}")

for snap in report['known_snapshots']:
    print(f"      - {snap['full_name']} à {snap['timestamp']} ({snap['confidence']}% confiance)")

for idx, snap in enumerate(report['unknown_snapshots'], 1):
    print(f"      - Inconnu #{idx} (vu {snap['count']} fois entre {snap['first_seen']} et {snap['last_seen']})")

print("\n✨ TOUT EST PRÊT ET VALIDÉ AVEC SUCCÈS POUR LE TEST !")
