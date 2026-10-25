from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from .models import User, PasswordResetOTP, TwoFactorOTP

class ComprehensiveUserModuleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_superuser(
            email='admin@alerta.com',
            password='AdminPassword123!',
            first_name='Admin',
            last_name='User'
        )
        self.normal_user = User.objects.create_user(
            email='user@alerta.com',
            password='UserPassword123!',
            first_name='Jean',
            last_name='Dupont'
        )

    # ── 1. Inscription ────────────────────────────────────────────────────────
    def test_register_success(self):
        url = reverse('register')
        data = {
            'email': 'newuser@alerta.com',
            'first_name': 'Nouveau',
            'last_name': 'Membre',
            'phone_number': '+21699000111',
            'password': 'SecurePassword123!',
            'password_confirm': 'SecurePassword123!'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = User.objects.get(email='newuser@alerta.com')
        self.assertEqual(created.phone_number, '+21699000111')

    # ── 2. Connexion standard (sans 2FA) ──────────────────────────────────────
    def test_login_standard(self):
        url = reverse('login')
        data = {'email': 'user@alerta.com', 'password': 'UserPassword123!'}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertIn('user', response.data)
        self.assertFalse(response.data['user']['is_2fa_enabled'])

    # ── 3. Profil & Mise à jour ───────────────────────────────────────────────
    def test_user_profile_update(self):
        self.client.force_authenticate(user=self.normal_user)
        url = reverse('profile')
        response = self.client.patch(url, {'first_name': 'Jean-Luc', 'phone_number': '12345678'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.normal_user.refresh_from_db()
        self.assertEqual(self.normal_user.first_name, 'Jean-Luc')
        self.assertEqual(self.normal_user.phone_number, '12345678')

    # ── 4. Changement de mot de passe ─────────────────────────────────────────
    def test_change_password(self):
        self.client.force_authenticate(user=self.normal_user)
        url = reverse('change_password')
        data = {
            'old_password': 'UserPassword123!',
            'new_password': 'BrandNewPassword123!',
            'new_password_confirm': 'BrandNewPassword123!'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.normal_user.refresh_from_db()
        self.assertTrue(self.normal_user.check_password('BrandNewPassword123!'))

    # ── 5. Mot de passe oublié (Forgot Password OTP) ──────────────────────────
    def test_forgot_password_and_reset_flow(self):
        # Étape 1 : Demande de code
        req_url = reverse('password_reset_request')
        resp1 = self.client.post(req_url, {'email': 'user@alerta.com'}, format='json')
        self.assertEqual(resp1.status_code, status.HTTP_200_OK)

        # Vérifier que le code OTP est créé en DB
        otp = PasswordResetOTP.objects.filter(user=self.normal_user, is_used=False).latest('created_at')
        self.assertEqual(len(otp.code), 6)
        self.assertTrue(otp.is_valid())

        # Étape 2 : Confirmation avec nouveau mot de passe
        confirm_url = reverse('password_reset_confirm')
        resp2 = self.client.post(confirm_url, {
            'email': 'user@alerta.com',
            'code': otp.code,
            'new_password': 'ForgotPassNew123!',
            'new_password_confirm': 'ForgotPassNew123!'
        }, format='json')
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)

        # Vérifier que le mot de passe est bien mis à jour et l'OTP consommé
        self.normal_user.refresh_from_db()
        self.assertTrue(self.normal_user.check_password('ForgotPassNew123!'))
        otp.refresh_from_db()
        self.assertTrue(otp.is_used)

    # ── 6. Authentification 2FA complète ─────────────────────────────────────
    def test_two_factor_authentication_flow(self):
        # Authentifier l'utilisateur
        self.client.force_authenticate(user=self.normal_user)

        # 1. Demande d'activation 2FA
        req_url = reverse('two_factor_enable_request')
        r1 = self.client.post(req_url)
        self.assertEqual(r1.status_code, status.HTTP_200_OK)

        otp2fa = TwoFactorOTP.objects.filter(user=self.normal_user, is_used=False).latest('created_at')
        self.assertEqual(len(otp2fa.code), 6)

        # 2. Confirmation de l'activation
        confirm_url = reverse('two_factor_enable_confirm')
        r2 = self.client.post(confirm_url, {'code': otp2fa.code}, format='json')
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        self.normal_user.refresh_from_db()
        self.assertTrue(self.normal_user.is_2fa_enabled)

        # 3. Déconnexion et tentative de login avec 2FA activé
        self.client.logout()
        login_url = reverse('login')
        r3 = self.client.post(login_url, {'email': 'user@alerta.com', 'password': 'UserPassword123!'}, format='json')
        self.assertEqual(r3.status_code, status.HTTP_200_OK)
        self.assertTrue(r3.data.get('requires_2fa'))
        self.assertIn('temp_token', r3.data)
        temp_token = r3.data['temp_token']

        # 4. Validation du code 2FA pour obtenir le JWT
        login_otp = TwoFactorOTP.objects.filter(user=self.normal_user, temp_token=temp_token, is_used=False).latest('created_at')
        verify_url = reverse('two_factor_login_verify')
        r4 = self.client.post(verify_url, {'temp_token': temp_token, 'code': login_otp.code}, format='json')
        self.assertEqual(r4.status_code, status.HTTP_200_OK)
        self.assertIn('access', r4.data)
        self.assertIn('refresh', r4.data)
        self.assertEqual(r4.data['user']['email'], 'user@alerta.com')

        # 5. Désactivation du 2FA
        self.client.force_authenticate(user=self.normal_user)
        disable_url = reverse('two_factor_disable')
        r5 = self.client.post(disable_url, {'password': 'UserPassword123!'}, format='json')
        self.assertEqual(r5.status_code, status.HTTP_200_OK)
        self.normal_user.refresh_from_db()
        self.assertFalse(self.normal_user.is_2fa_enabled)

    # ── 7. Suppression de compte ──────────────────────────────────────────────
    def test_delete_own_account(self):
        user_to_delete = User.objects.create_user(
            email='delete_me@alerta.com',
            password='MyPassword123!'
        )
        self.client.force_authenticate(user=user_to_delete)
        url = reverse('delete_account')

        # Mauvais mot de passe -> erreur 400
        fail_resp = self.client.post(url, {'password': 'WrongPassword!'}, format='json')
        self.assertEqual(fail_resp.status_code, status.HTTP_400_BAD_REQUEST)

        # Bon mot de passe -> succès et compte supprimé
        success_resp = self.client.post(url, {'password': 'MyPassword123!'}, format='json')
        self.assertEqual(success_resp.status_code, status.HTTP_200_OK)
        self.assertFalse(User.objects.filter(email='delete_me@alerta.com').exists())

    # ── 8. Administration (Membre 1) ──────────────────────────────────────────
    def test_admin_toggle_user_status(self):
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('admin_toggle_user_status', kwargs={'pk': self.normal_user.pk})

        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.normal_user.refresh_from_db()
        self.assertFalse(self.normal_user.is_active)

        # Un compte inactif ne peut plus se connecter
        self.client.logout()
        login_url = reverse('login')
        login_resp = self.client.post(login_url, {'email': 'user@alerta.com', 'password': 'UserPassword123!'})
        self.assertEqual(login_resp.status_code, status.HTTP_403_FORBIDDEN)
