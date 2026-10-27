import os, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "alerta_project.settings")
django.setup()
from recognition.models import Zone
from recognition import services

zone = Zone.objects.first()
zone.threshold = 0.50
zone.save()

report = services.identify_video_faces(zone, "test_samples/cctv_youtube.mp4", sample_fps=2.0)
print("Known persons:", report["known_persons"])
print("Alert triggered:", report["alert_triggered"])
print("Unknown count:", len(report["unknown_snapshots"]))
for i, s in enumerate(report["unknown_snapshots"]):
    print(f"  Unknown {i+1}: {s['first_seen']} to {s['last_seen']}, count: {s['count']}, confidence: {s['confidence']}")
for t in report["timeline"]:
    print("  Time:", t["timestamp"], [(f["is_known"], f["person"]["full_name"] if f["person"] else "INCONNU", f["confidence"]) for f in t["faces"]])
