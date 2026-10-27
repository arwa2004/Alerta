import shutil
import tempfile
from pathlib import Path

import pymupdf
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from users.models import User

from .models import FloorPlan, Project

TMP_ROOT = tempfile.mkdtemp(prefix='alerta_private_test_')


def make_pdf(pages=1, width=595, height=842):
    doc = pymupdf.open()
    for i in range(pages):
        page = doc.new_page(width=width, height=height)
        page.draw_rect(pymupdf.Rect(50, 50, 300, 300))
        page.insert_text((60, 400), f"Plan page {i + 1}")
    data = doc.tobytes()
    doc.close()
    return data


def upload(data, name='plan.pdf', **extra):
    return {'file': SimpleUploadedFile(name, data, content_type='application/pdf'), **extra}


@override_settings(PRIVATE_MEDIA_ROOT=Path(TMP_ROOT))
class PlannerBase(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TMP_ROOT, ignore_errors=True)

    def setUp(self):
        self.alice = User.objects.create_user(email='alice@alerta.com', password='AlicePass123!')
        self.bob = User.objects.create_user(email='bob@alerta.com', password='BobPass123!')
        self.admin = User.objects.create_superuser(email='admin@alerta.com', password='AdminPass123!')
        self.client = APIClient()
        self.client.force_authenticate(self.alice)
        self.project = Project.objects.create(owner=self.alice, name='Villa', budget='1500.00', currency='TND')

    def post_pdf(self, data, project=None, **extra):
        project = project or self.project
        url = reverse('planner_floorplan_list', args=[project.pk])
        return self.client.post(url, upload(data, **extra.pop('upload_kwargs', {}), **extra), format='multipart')


@override_settings(PRIVATE_MEDIA_ROOT=Path(TMP_ROOT))
class ProjectTests(PlannerBase):
    def test_create_project_sets_owner_and_timestamps(self):
        r = self.client.post(reverse('planner_project_list'),
                             {'name': ' Maison Tunis ', 'budget': '2500.50', 'currency': 'EUR'}, format='json')
        self.assertEqual(r.status_code, status.HTTP_201_CREATED)
        p = Project.objects.get(pk=r.data['id'])
        self.assertEqual(p.owner, self.alice)
        self.assertEqual(p.name, 'Maison Tunis')
        self.assertEqual(str(p.budget), '2500.50')
        self.assertEqual(p.currency, 'EUR')
        self.assertIsNotNone(p.created_at)
        self.assertIsNotNone(p.updated_at)

    def test_owner_cannot_be_forced_from_payload(self):
        r = self.client.post(reverse('planner_project_list'),
                             {'name': 'X', 'budget': '1', 'currency': 'TND', 'owner': self.bob.pk}, format='json')
        self.assertEqual(Project.objects.get(pk=r.data['id']).owner, self.alice)

    def test_invalid_project_data_rejected(self):
        url = reverse('planner_project_list')
        self.assertEqual(self.client.post(url, {'name': '  ', 'budget': '10', 'currency': 'TND'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {'name': 'A', 'budget': '-5', 'currency': 'TND'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(url, {'name': 'A', 'budget': '5', 'currency': 'XXX'}, format='json').status_code, 400)

    def test_list_only_returns_own_projects(self):
        Project.objects.create(owner=self.bob, name='Bob house')
        r = self.client.get(reverse('planner_project_list'))
        self.assertEqual(r.status_code, 200)
        self.assertEqual([p['name'] for p in r.data], ['Villa'])

    def test_requires_authentication(self):
        anon = APIClient()
        self.assertEqual(anon.get(reverse('planner_project_list')).status_code, 401)
        self.assertEqual(anon.post(reverse('planner_project_list'), {'name': 'x'}, format='json').status_code, 401)

    def test_other_user_gets_404_on_project_detail(self):
        self.client.force_authenticate(self.bob)
        self.assertEqual(self.client.get(reverse('planner_project_detail', args=[self.project.pk])).status_code, 404)


@override_settings(PRIVATE_MEDIA_ROOT=Path(TMP_ROOT))
class PDFUploadTests(PlannerBase):
    def test_upload_valid_pdf_renders_and_stores_privately(self):
        r = self.post_pdf(make_pdf(pages=3), page=2)
        self.assertEqual(r.status_code, status.HTTP_201_CREATED, r.data)
        self.assertEqual(r.data['page_count'], 3)
        self.assertEqual(r.data['selected_page'], 2)
        self.assertGreater(r.data['image_width'], 0)
        self.assertEqual(len(r.data['sha256']), 64)
        self.assertNotIn('pdf_file', r.data)  # aucun chemin disque exposé
        plan = FloorPlan.objects.get(pk=r.data['id'])
        self.assertTrue(Path(plan.pdf_file.path).is_file())
        self.assertTrue(str(plan.image_file.path).startswith(str(Path(TMP_ROOT).resolve())) or
                        str(plan.image_file.path).startswith(TMP_ROOT))
        with open(plan.image_file.path, 'rb') as fh:
            self.assertEqual(fh.read(8), b'\x89PNG\r\n\x1a\n')
        with self.assertRaises(ValueError):
            plan.pdf_file.url  # pas d'URL publique

    def test_user_filename_not_used_on_disk(self):
        r = self.post_pdf(make_pdf(), upload_kwargs={'name': '../../evil.pdf'})
        self.assertEqual(r.status_code, 201)
        plan = FloorPlan.objects.get(pk=r.data['id'])
        self.assertEqual(plan.original_filename, 'evil.pdf')
        self.assertNotIn('evil', plan.pdf_file.name)

    def test_rejects_wrong_extension(self):
        r = self.post_pdf(make_pdf(), upload_kwargs={'name': 'plan.png'})
        self.assertEqual(r.status_code, 400)

    def test_rejects_non_pdf_content_with_pdf_extension(self):
        r = self.post_pdf(b'MZ\x90\x00 this is an executable', upload_kwargs={'name': 'plan.pdf'})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(FloorPlan.objects.count(), 0)

    def test_rejects_corrupted_pdf(self):
        r = self.post_pdf(b'%PDF-1.7\n garbage garbage garbage')
        self.assertEqual(r.status_code, 400)

    def test_rejects_empty_file(self):
        self.assertEqual(self.post_pdf(b'').status_code, 400)

    @override_settings(PLANNER_MAX_UPLOAD_MB=0)
    def test_rejects_oversized_file(self):
        self.assertEqual(self.post_pdf(make_pdf()).status_code, 400)

    @override_settings(PLANNER_MAX_PDF_PAGES=2)
    def test_rejects_too_many_pages(self):
        self.assertEqual(self.post_pdf(make_pdf(pages=3)).status_code, 400)

    def test_rejects_encrypted_pdf(self):
        doc = pymupdf.open()
        doc.new_page()
        data = doc.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw='secret', owner_pw='owner')
        doc.close()
        self.assertEqual(self.post_pdf(data).status_code, 400)

    def test_rejects_page_out_of_range(self):
        r = self.post_pdf(make_pdf(pages=2), page=5)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(FloorPlan.objects.count(), 0)

    def test_missing_file_rejected(self):
        url = reverse('planner_floorplan_list', args=[self.project.pk])
        self.assertEqual(self.client.post(url, {}, format='multipart').status_code, 400)

    @override_settings(PLANNER_MAX_RENDER_PIXELS=500)
    def test_render_is_capped_for_huge_pages(self):
        r = self.post_pdf(make_pdf(width=5000, height=3000))
        self.assertEqual(r.status_code, 201)
        self.assertLessEqual(max(r.data['image_width'], r.data['image_height']), 502)


@override_settings(PRIVATE_MEDIA_ROOT=Path(TMP_ROOT))
class FloorPlanAuthorizationTests(PlannerBase):
    def setUp(self):
        super().setUp()
        r = self.post_pdf(make_pdf())
        self.plan_id = r.data['id']

    def test_owner_can_retrieve_metadata_and_image(self):
        meta = self.client.get(reverse('planner_floorplan_detail', args=[self.plan_id]))
        self.assertEqual(meta.status_code, 200)
        self.assertEqual(meta.data['project'], self.project.pk)
        img = self.client.get(reverse('planner_floorplan_image', args=[self.plan_id]))
        self.assertEqual(img.status_code, 200)
        self.assertEqual(img['Content-Type'], 'image/png')
        self.assertIn('no-store', img['Cache-Control'])
        self.assertEqual(b''.join(img.streaming_content)[:4], b'\x89PNG')

    def test_list_floor_plans_of_project(self):
        r = self.client.get(reverse('planner_floorplan_list', args=[self.project.pk]))
        self.assertEqual([p['id'] for p in r.data], [self.plan_id])

    def test_other_user_cannot_access_or_upload(self):
        self.client.force_authenticate(self.bob)
        self.assertEqual(self.client.get(reverse('planner_floorplan_detail', args=[self.plan_id])).status_code, 404)
        self.assertEqual(self.client.get(reverse('planner_floorplan_image', args=[self.plan_id])).status_code, 404)
        self.assertEqual(self.client.get(reverse('planner_floorplan_list', args=[self.project.pk])).status_code, 404)
        self.assertEqual(self.post_pdf(make_pdf()).status_code, 404)
        self.assertEqual(FloorPlan.objects.count(), 1)

    def test_admin_role_does_not_bypass_privacy(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(reverse('planner_floorplan_image', args=[self.plan_id])).status_code, 404)

    def test_anonymous_cannot_access(self):
        anon = APIClient()
        self.assertEqual(anon.get(reverse('planner_floorplan_detail', args=[self.plan_id])).status_code, 401)
        self.assertEqual(anon.get(reverse('planner_floorplan_image', args=[self.plan_id])).status_code, 401)
        url = reverse('planner_floorplan_list', args=[self.project.pk])
        self.assertEqual(anon.post(url, upload(make_pdf()), format='multipart').status_code, 401)

    def test_private_files_not_reachable_via_media_url(self):
        plan = FloorPlan.objects.get(pk=self.plan_id)
        r = APIClient().get('/media/' + plan.image_file.name)
        self.assertEqual(r.status_code, 404)
