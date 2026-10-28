import tempfile
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient, APITestCase
from rest_framework import status

from .models import Evenement, Zone
from .services import creer_evenement, evaluer_criticite

User = get_user_model()

class EvenementsModuleTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Utilisateur 1 (Propriétaire standard)
        self.user1 = User.objects.create_user(
            email='arwa.test@alerta.tn',
            password='Password123!',
            first_name='Arwa',
            last_name='Ben Amar',
            role='user'
        )

        # Utilisateur 2 (Autre utilisateur pour tester l'isolation)
        self.user2 = User.objects.create_user(
            email='autre.user@alerta.tn',
            password='Password123!',
            first_name='Autre',
            last_name='User',
            role='user'
        )

        # Administrateur
        self.admin = User.objects.create_superuser(
            email='admin@alerta.tn',
            password='AdminPassword123!',
            first_name='Admin',
            last_name='Alerta',
            role='admin'
        )

        # Zone de test
        self.zone_salon = Zone.objects.create(
            nom='Salon Principal',
            user=self.user1
        )

    def test_evaluation_criticite(self):
        """
        Teste les règles d'évaluation du niveau de criticité :
        - Inconnu -> Criticité ÉLEVÉE (>= 0.70) et alerte déclenchée
        - Visage connu -> Criticité FAIBLE (< 0.35)
        """
        res_critique = evaluer_criticite('inconnu', 0.85)
        self.assertGreaterEqual(res_critique['score_criticite'], 0.70)
        self.assertEqual(res_critique['niveau_criticite'], 'eleve')
        self.assertTrue(res_critique['alerte_declenchee'])

        res_faible = evaluer_criticite('visage_connu', 0.95)
        self.assertLess(res_faible['score_criticite'], 0.35)
        self.assertEqual(res_faible['niveau_criticite'], 'faible')
        self.assertFalse(res_faible['alerte_declenchee'])

    def test_creer_evenement_service(self):
        """
        Teste la création de bout en bout via le service (IA, ML, Image).
        """
        evenement = creer_evenement(
            user=self.user1,
            type_event='inconnu',
            zone=self.zone_salon,
            personne_nom='',
            score_confiance=0.90
        )
        self.assertIsNotNone(evenement.id)
        self.assertEqual(evenement.user, self.user1)
        self.assertTrue(len(evenement.description) > 0)
        self.assertTrue(evenement.image_reconstituee)
        self.assertIn(evenement.niveau_criticite, ['faible', 'moyen', 'eleve'])

    def test_isolation_donnees_utilisateurs(self):
        """
        Garantit qu'un utilisateur ne voit jamais les événements d'un autre utilisateur.
        """
        # Création d'un événement pour user1 et d'un pour user2
        creer_evenement(user=self.user1, type_event='visage_connu', personne_nom='Arwa')
        creer_evenement(user=self.user2, type_event='inconnu')

        # Requête par user1
        self.client.force_authenticate(user=self.user1)
        response = self.client.get('/api/evenements/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Gestion si paginé ou liste directe
        results = response.data['results'] if 'results' in response.data else response.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['personne_nom'], 'Arwa')

    def test_admin_voit_tous_les_evenements(self):
        """
        Garantit que le rôle administrateur accède à l'ensemble des événements du système.
        """
        creer_evenement(user=self.user1, type_event='visage_connu')
        creer_evenement(user=self.user2, type_event='mouvement')

        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/evenements/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results'] if 'results' in response.data else response.data
        self.assertEqual(len(results), 2)

    def test_filtres_evenements(self):
        """
        Teste les filtres par type d'événement et recherche textuelle.
        """
        creer_evenement(user=self.user1, type_event='visage_connu', personne_nom='Mohamed')
        creer_evenement(user=self.user1, type_event='inconnu')

        self.client.force_authenticate(user=self.user1)

        # Filtre par type=inconnu
        res_filter = self.client.get('/api/evenements/?type=inconnu')
        results = res_filter.data['results'] if 'results' in res_filter.data else res_filter.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['type'], 'inconnu')

        # Recherche par personne_nom
        res_search = self.client.get('/api/evenements/?search=Mohamed')
        results_search = res_search.data['results'] if 'results' in res_search.data else res_search.data
        self.assertEqual(len(results_search), 1)
        self.assertEqual(results_search[0]['personne_nom'], 'Mohamed')

    def test_dashboard_stats_endpoint(self):
        """
        Teste l'endpoint consolidé /api/dashboard/.
        """
        creer_evenement(user=self.user1, type_event='visage_connu')
        creer_evenement(user=self.user1, type_event='inconnu')

        self.client.force_authenticate(user=self.user1)
        response = self.client.get('/api/dashboard/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data['total_evenements'], 2)
        self.assertEqual(data['inconnus_count'], 1)
        self.assertEqual(data['visages_connus_count'], 1)
        self.assertEqual(len(data['derniers_evenements']), 2)

    def test_suppression_evenement(self):
        """
        Teste la suppression sécurisée d'un événement.
        """
        ev = creer_evenement(user=self.user1, type_event='mouvement')
        self.client.force_authenticate(user=self.user1)

        # Suppression OK par le propriétaire
        del_res = self.client.delete(f'/api/evenements/{ev.id}/')
        self.assertEqual(del_res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Evenement.objects.filter(id=ev.id).exists())

    def test_simulation_endpoint(self):
        """
        Teste l'endpoint de simulation /api/evenements/simulate/.
        """
        self.client.force_authenticate(user=self.user1)
        response = self.client.post('/api/evenements/simulate/', {'scenario': 'inconnu'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['type'], 'inconnu')
        self.assertTrue(Evenement.objects.filter(id=response.data['id']).exists())


# Image PNG 1x1 minimale pour les tests d'upload
TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06"
    b"\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe"
    b"\xa7\x1a\x1b\x1b\x00\x00\x00\x00IEND\xaeB`\x82"
)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PhotoVisionTests(APITestCase):
    """
    Tests unitaires dédiés au pipeline Gemini Vision et upload de photo (Point 1).
    """

    def setUp(self):
        self.user = User.objects.create_user(
            email='test.vision@alerta.tn',
            password='Password123!',
            first_name='Vision',
            last_name='Tester',
            role='user'
        )
        self.client.force_authenticate(user=self.user)

    def _upload(self, content=TINY_PNG, ctype="image/png"):
        f = SimpleUploadedFile("cap.png", content, content_type=ctype)
        return self.client.post(
            "/api/evenements/simulate/",
            {"type": "inconnu", "photo_capturee": f},
            format="multipart"
        )

    def test_simulate_with_photo(self):
        """1. Vérifie la création d'événement avec upload de photo réelle."""
        r = self._upload()
        self.assertEqual(r.status_code, 201)
        self.assertTrue(r.data["photo_capturee"])

    def test_rejects_non_image(self):
        """2. Vérifie le rejet d'un fichier non image."""
        r = self._upload(b"not an image", "text/plain")
        self.assertEqual(r.status_code, 400)

    @patch("events.services.decrire_photo_gemini", return_value="Une personne devant une porte.")
    def test_gemini_vision_used(self, _):
        """3. Vérifie que Gemini Vision est bien sollicité et marque description_source=gemini_vision."""
        ev_id = self._upload().data["id"]
        r = self.client.post(f"/api/evenements/{ev_id}/analyser-gemini/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["description_source"], "gemini_vision")
        self.assertEqual(r.data["description"], "Une personne devant une porte.")

    @patch("events.services.decrire_photo_gemini", side_effect=Exception("quota"))
    def test_fallback_marked_simulation(self, _):
        """4. Vérifie le repli propre marqué description_source=simulation en cas d'erreur de quota/API."""
        ev_id = self._upload().data["id"]
        r = self.client.post(f"/api/evenements/{ev_id}/analyser-gemini/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["description_source"], "simulation")
