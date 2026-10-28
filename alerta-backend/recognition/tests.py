import io
import shutil
import tempfile
from datetime import timedelta
from unittest import mock

import numpy as np
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from users.models import User
from .models import Face, KnownPerson, Zone
from .services import distance_to_confidence, identify_encoding

TMP_MEDIA = tempfile.mkdtemp()

_rng = np.random.default_rng(42)
ALICE = _rng.normal(size=128)
ALICE /= np.linalg.norm(ALICE)
BOB = _rng.normal(size=128)
BOB /= np.linalg.norm(BOB)
NOISE = _rng.normal(size=128)
NOISE /= np.linalg.norm(NOISE)      # vecteur unitaire : ALICE + NOISE * d est à distance d d'Alice

# marqueur (pixel 0,0) -> encodage renvoyé par le faux moteur
ENCODINGS = {
    1: ALICE,
    2: ALICE + NOISE * 0.05,
    3: ALICE - NOISE * 0.05,
    4: ALICE + NOISE * 0.08,
    5: ALICE - NOISE * 0.08,
    8: BOB,
    9: ALICE + NOISE * 0.5,     # le visage d'Alice le plus proche est à 0.45
}


def make_image(marker, seed=None, size=400):
    """PNG bruité (donc net) dont le pixel (0,0) porte le marqueur d'identité."""
    rng = np.random.default_rng(seed if seed is not None else marker * 1000)
    arr = rng.integers(60, 200, size=(size, size, 3), dtype=np.uint8)
    arr[0, 0, 0] = marker
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format='PNG')
    return SimpleUploadedFile(f"photo_{marker}_{seed}.png", buf.getvalue(), content_type='image/png')


def fake_locate(arr):
    return [(50, 350, 350, 50)]


def fake_encode(arr, location):
    return ENCODINGS[int(arr[0, 0, 0])]


@override_settings(MEDIA_ROOT=TMP_MEDIA,
                   PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class RecognitionTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP_MEDIA, ignore_errors=True)

    def setUp(self):
        cache.clear()
        patcher_l = mock.patch('recognition.engine.locate_faces', side_effect=fake_locate)
        patcher_e = mock.patch('recognition.engine.encode_face', side_effect=fake_encode)
        patcher_l.start(); patcher_e.start()
        self.addCleanup(patcher_l.stop); self.addCleanup(patcher_e.stop)

        self.user = User.objects.create_user(email='a@alerta.com', password='Passw0rd!x')
        self.other = User.objects.create_user(email='b@alerta.com', password='Passw0rd!x')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.zone = Zone.objects.create(owner=self.user, name='Maison')
        self.office = Zone.objects.create(owner=self.user, name='Bureau')

    # ── helpers ────────────────────────────────────────────────────────────
    def post_person(self, markers=(1, 2, 3), **extra):
        data = {
            'full_name': 'Alice Ben Youssef', 'status': 'authorized', 'consent': 'true',
            'zones': [self.zone.id, self.office.id],
            'images': [make_image(m, seed=i) for i, m in enumerate(markers)],
        }
        data.update(extra)
        return self.client.post(reverse('person-list'), data, format='multipart')

    def make_person(self, markers=(1, 2, 3), **kwargs):
        resp = self.post_person(markers, **kwargs)
        self.assertEqual(resp.status_code, 201, resp.data)
        return KnownPerson.objects.get(pk=resp.data['id'])

    # ── zones ──────────────────────────────────────────────────────────────
    def test_zone_crud_and_unique_name(self):
        r = self.client.post(reverse('zone-list'), {'name': 'Garage', 'threshold': 0.45}, format='json')
        self.assertEqual(r.status_code, 201)
        dup = self.client.post(reverse('zone-list'), {'name': 'garage'}, format='json')
        self.assertEqual(dup.status_code, 400)
        bad = self.client.post(reverse('zone-list'), {'name': 'X', 'threshold': 0.9}, format='json')
        self.assertEqual(bad.status_code, 400)

    def test_zone_isolation(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(reverse('zone-list')).data, [])
        r = self.client.get(reverse('zone-detail', args=[self.zone.id]))
        self.assertEqual(r.status_code, 404)

    # ── création d'une personne ────────────────────────────────────────────
    def test_create_person_ok(self):
        person = self.make_person()
        self.assertEqual(person.faces.count(), 3)
        self.assertEqual(person.zones.count(), 2)          # plusieurs-à-plusieurs
        self.assertIsNotNone(person.consent_date)

    def test_create_requires_three_photos(self):
        r = self.post_person(markers=(1, 2))
        self.assertEqual(r.status_code, 400)
        self.assertIn('images', r.data)

    def test_create_requires_consent(self):
        r = self.post_person(consent='false')
        self.assertEqual(r.status_code, 400)
        self.assertIn('consent', r.data)

    def test_create_rejects_other_person_photo(self):
        r = self.post_person(markers=(1, 2, 8))
        self.assertEqual(r.status_code, 400)
        self.assertIn('Photo 3', str(r.data['images']))
        self.assertEqual(KnownPerson.objects.count(), 0)

    def test_create_rejects_duplicates(self):
        data = {
            'full_name': 'Alice', 'consent': 'true',
            'images': [make_image(1, seed=7), make_image(1, seed=7), make_image(2, seed=8)],
        }
        r = self.client.post(reverse('person-list'), data, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertIn('doublon', str(r.data['images']))

    def test_create_rejects_blurry_and_tiny(self):
        flat = np.full((400, 400, 3), 128, dtype=np.uint8)
        buf = io.BytesIO(); Image.fromarray(flat).save(buf, format='PNG')
        blurry = SimpleUploadedFile('flat.png', buf.getvalue(), content_type='image/png')
        buf2 = io.BytesIO(); Image.fromarray(flat[:100, :100]).save(buf2, format='PNG')
        tiny = SimpleUploadedFile('tiny.png', buf2.getvalue(), content_type='image/png')
        data = {'full_name': 'Alice', 'consent': 'true',
                'images': [blurry, tiny, make_image(1)]}
        r = self.client.post(reverse('person-list'), data, format='multipart')
        self.assertEqual(r.status_code, 400)
        text = str(r.data['images'])
        self.assertIn('Photo 1', text); self.assertIn('Photo 2', text)

    def test_cannot_link_foreign_zone(self):
        foreign = Zone.objects.create(owner=self.other, name='Autre')
        r = self.post_person(zones=[foreign.id])
        self.assertEqual(r.status_code, 400)

    # ── ajout / suppression de photos ─────────────────────────────────────
    def test_add_and_remove_faces(self):
        person = self.make_person()
        r = self.client.post(reverse('person-add-faces', args=[person.id]),
                             {'images': [make_image(4, seed=50)]}, format='multipart')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(person.faces.count(), 4)

        bad = self.client.post(reverse('person-add-faces', args=[person.id]),
                               {'images': [make_image(8, seed=51)]}, format='multipart')
        self.assertEqual(bad.status_code, 400)

        face = person.faces.first()
        path = face.image.path
        d = self.client.delete(reverse('person-remove-face', args=[person.id, face.id]))
        self.assertEqual(d.status_code, 204)
        self.assertEqual(person.faces.count(), 3)
        d2 = self.client.delete(reverse('person-remove-face', args=[person.id, person.faces.first().id]))
        self.assertEqual(d2.status_code, 400)           # minimum 3 photos conservé
        import os
        self.assertFalse(os.path.exists(path))          # fichier effacé

    def test_delete_person_erases_files(self):
        person = self.make_person()
        paths = [f.image.path for f in person.faces.all()]
        r = self.client.delete(reverse('person-detail', args=[person.id]))
        self.assertEqual(r.status_code, 204)
        import os
        self.assertEqual(Face.objects.count(), 0)
        self.assertTrue(all(not os.path.exists(p) for p in paths))

    # ── moteur de comparaison ──────────────────────────────────────────────
    def test_identify_known_and_unknown(self):
        person = self.make_person()
        known = identify_encoding(self.zone, ALICE + NOISE * 0.1)
        self.assertTrue(known.is_known)
        self.assertEqual(known.person, person)
        self.assertFalse(known.should_alert)
        stranger = identify_encoding(self.zone, BOB)
        self.assertFalse(stranger.is_known)
        self.assertTrue(stranger.should_alert)

    def test_identify_picks_best_not_first(self):
        a = self.make_person()
        b = KnownPerson.objects.create(owner=self.user, full_name='Autre', consent=True)
        b.zones.add(self.zone)
        Face.objects.create(person=b, image='x.png', encoding=list(ALICE + NOISE * 0.02), image_hash='h1')
        res = identify_encoding(self.zone, ALICE + NOISE * 0.02)
        self.assertEqual(res.person, b)
        self.assertAlmostEqual(res.distance, 0.0, places=3)

    def test_threshold_is_per_zone(self):
        self.make_person()
        probe = ENCODINGS[9]                         # meilleure distance = 0.45
        self.assertTrue(identify_encoding(self.zone, probe).is_known)
        self.zone.threshold = 0.3
        self.zone.save()
        self.assertFalse(identify_encoding(self.zone, probe).is_known)

    def test_person_not_in_zone_is_unknown(self):
        person = self.make_person()
        person.zones.set([self.office])              # retiré de la zone « Maison »
        self.assertFalse(identify_encoding(self.zone, ALICE).is_known)
        self.assertTrue(identify_encoding(self.office, ALICE).is_known)

    def test_expired_validity_and_withdrawn_consent(self):
        person = self.make_person()
        person.valid_to = timezone.now() - timedelta(hours=1)
        person.save()
        self.assertFalse(identify_encoding(self.zone, ALICE).is_known)
        person.valid_to = None; person.save()
        self.assertTrue(identify_encoding(self.zone, ALICE).is_known)
        person.consent = False; person.save()
        self.assertFalse(identify_encoding(self.zone, ALICE).is_known)

    def test_watched_person_triggers_alert(self):
        self.make_person(status='watched')
        res = identify_encoding(self.zone, ALICE)
        self.assertTrue(res.is_known)
        self.assertTrue(res.should_alert)

    def test_confidence_decreases_with_distance(self):
        vals = [distance_to_confidence(d, 0.5) for d in (0.1, 0.3, 0.5, 0.7)]
        self.assertEqual(vals, sorted(vals, reverse=True))
        self.assertTrue(all(0 <= v <= 100 for v in vals))

    def test_identify_endpoint(self):
        self.make_person()
        r = self.client.post(reverse('zone-identify', args=[self.zone.id]),
                             {'image': make_image(2, seed=99)}, format='multipart')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['count'], 1)
        self.assertTrue(r.data['faces'][0]['is_known'])
        self.zone.is_active = False; self.zone.save()
        r2 = self.client.post(reverse('zone-identify', args=[self.zone.id]),
                              {'image': make_image(2, seed=99)}, format='multipart')
        self.assertEqual(r2.status_code, 409)

    # ── isolation et confidentialité ──────────────────────────────────────
    def test_person_and_photo_isolation(self):
        person = self.make_person()
        face = person.faces.first()
        self.assertEqual(self.client.get(reverse('face_image', args=[face.id])).status_code, 200)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(reverse('person-list')).data, [])
        self.assertEqual(self.client.get(reverse('person-detail', args=[person.id])).status_code, 404)
        self.assertEqual(self.client.get(reverse('face_image', args=[face.id])).status_code, 404)

    def test_admin_cannot_see_other_users_faces(self):
        person = self.make_person()
        admin = User.objects.create_superuser(email='root@alerta.com', password='Passw0rd!x')
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get(reverse('person-list')).data, [])
        face = person.faces.first()
        self.assertEqual(self.client.get(reverse('face_image', args=[face.id])).status_code, 404)

    def test_filters(self):
        self.make_person()
        self.make_person(markers=(1, 2, 3), full_name='Visiteur', status='visitor', zones=[self.office.id])
        r = self.client.get(reverse('person-list'), {'status': 'visitor'})
        self.assertEqual(len(r.data), 1)
        r = self.client.get(reverse('person-list'), {'zone': self.zone.id})
        self.assertEqual(len(r.data), 1)
        r = self.client.get(reverse('person-list'), {'search': 'alice'})
        self.assertEqual(len(r.data), 1)
