import random
import secrets
from django.db import models
from django.conf import settings
from django.core.mail import send_mail
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from .models import User, PasswordResetOTP, TwoFactorOTP
from .serializers import (
    CustomTokenObtainPairSerializer,
    RegisterSerializer,
    UserSerializer,
    AdminUserSerializer,
    ChangePasswordSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
    TwoFactorVerifySerializer,
    TwoFactorLoginVerifySerializer,
    DeleteAccountSerializer,
)
from .permissions import IsAdminUserRole


def generate_6_digit_code():
    return f"{random.randint(100000, 999999)}"


# ==============================================================================
# Authentification principale & Login avec support 2FA
# ==============================================================================

class CustomLoginView(APIView):
    """
    Connexion sécurisée :
    - Si 2FA est désactivé -> Renvoie directement les tokens JWT (access + refresh + user).
    - Si 2FA est activé -> Génère un OTP par email et renvoie requires_2fa: true avec un temp_token.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '')

        if not email or not password:
            return Response(
                {"detail": "Veuillez renseigner votre email et mot de passe."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {"detail": "Identifiants de connexion invalides."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not user.check_password(password):
            return Response(
                {"detail": "Identifiants de connexion invalides."},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not user.is_active:
            return Response(
                {"detail": "Ce compte a été désactivé par un administrateur."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Vérifier si 2FA est activé pour ce compte
        if user.is_2fa_enabled:
            code = generate_6_digit_code()
            temp_token = secrets.token_hex(32)

            # Invalider les anciens codes 2FA non utilisés
            TwoFactorOTP.objects.filter(user=user, is_used=False).update(is_used=True)

            TwoFactorOTP.objects.create(
                user=user,
                code=code,
                temp_token=temp_token
            )

            # Envoi du code par email
            subject = "Alerta - Votre code d'authentification à deux facteurs"
            message = (
                f"Bonjour {user.first_name or 'Utilisateur'},\n\n"
                f"Voici votre code de sécurité à 6 chiffres pour vous connecter à Alerta :\n\n"
                f"  >>> {code} <<<\n\n"
                f"Ce code est valable pendant 10 minutes.\n"
                f"Si vous n'êtes pas à l'origine de cette demande, sécurisez immédiatement votre compte.\n\n"
                f"L'équipe Alerta Security"
            )
            try:
                send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=True)
            except Exception as e:
                print("Erreur envoi email 2FA:", e)

            resp_data = {
                "requires_2fa": True,
                "email": user.email,
                "temp_token": temp_token,
                "message": "Un code de vérification à 6 chiffres vous a été envoyé par e-mail.",
            }
            if settings.DEBUG:
                resp_data["dev_code"] = code

            return Response(resp_data, status=status.HTTP_200_OK)

        # Connexion classique sans 2FA
        refresh = RefreshToken.for_user(user)
        # Inject custom claims
        refresh['id'] = user.id
        refresh['email'] = user.email
        refresh['first_name'] = user.first_name
        refresh['last_name'] = user.last_name
        refresh['role'] = user.role
        refresh['is_active'] = user.is_active
        refresh['is_2fa_enabled'] = user.is_2fa_enabled

        user_data = UserSerializer(user, context={'request': request}).data
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": user_data
        }, status=status.HTTP_200_OK)


class TwoFactorLoginVerifyView(APIView):
    """
    Validation du code 2FA pour finaliser la connexion.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = TwoFactorLoginVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        temp_token = serializer.validated_data['temp_token']
        code = serializer.validated_data['code']

        try:
            otp = TwoFactorOTP.objects.get(temp_token=temp_token, code=code, is_used=False)
        except TwoFactorOTP.DoesNotExist:
            return Response(
                {"detail": "Code de vérification invalide ou expiré."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not otp.is_valid():
            return Response(
                {"detail": "Ce code a expiré. Veuillez vous reconnecter."},
                status=status.HTTP_400_BAD_REQUEST
            )

        otp.is_used = True
        otp.save()

        user = otp.user
        if not user.is_active:
            return Response(
                {"detail": "Ce compte a été désactivé par un administrateur."},
                status=status.HTTP_403_FORBIDDEN
            )

        refresh = RefreshToken.for_user(user)
        refresh['id'] = user.id
        refresh['email'] = user.email
        refresh['first_name'] = user.first_name
        refresh['last_name'] = user.last_name
        refresh['role'] = user.role
        refresh['is_active'] = user.is_active
        refresh['is_2fa_enabled'] = user.is_2fa_enabled

        user_data = UserSerializer(user, context={'request': request}).data
        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": user_data
        }, status=status.HTTP_200_OK)


# ==============================================================================
# Gestion du 2FA dans les paramètres utilisateur
# ==============================================================================

class TwoFactorRequestEnableView(APIView):
    """
    Étape 1 activation 2FA : Génère et envoie un code à l'adresse e-mail de l'utilisateur connecté.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.is_2fa_enabled:
            return Response(
                {"detail": "L'authentification 2FA est déjà activée sur ce compte."},
                status=status.HTTP_400_BAD_REQUEST
            )

        code = generate_6_digit_code()
        TwoFactorOTP.objects.filter(user=user, is_used=False).update(is_used=True)
        TwoFactorOTP.objects.create(user=user, code=code)

        subject = "Alerta - Code d'activation 2FA"
        message = (
            f"Bonjour {user.first_name or 'Utilisateur'},\n\n"
            f"Voici votre code de confirmation pour ACTIVER la double authentification (2FA) sur Alerta :\n\n"
            f"  >>> {code} <<<\n\n"
            f"Ce code est valable pendant 10 minutes.\n"
            f"L'équipe Alerta Security"
        )
        try:
            send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=True)
        except Exception as e:
            print("Erreur envoi email activation 2FA:", e)

        resp = {"message": f"Code de vérification envoyé à {user.email}."}
        if settings.DEBUG:
            resp["dev_code"] = code
        return Response(resp, status=status.HTTP_200_OK)


class TwoFactorConfirmEnableView(APIView):
    """
    Étape 2 activation 2FA : Vérifie le code et active le 2FA.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = TwoFactorVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        code = serializer.validated_data['code']

        try:
            otp = TwoFactorOTP.objects.filter(user=user, code=code, is_used=False).latest('created_at')
        except TwoFactorOTP.DoesNotExist:
            return Response(
                {"detail": "Code invalide."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not otp.is_valid():
            return Response(
                {"detail": "Ce code a expiré."},
                status=status.HTTP_400_BAD_REQUEST
            )

        otp.is_used = True
        otp.save()

        user.is_2fa_enabled = True
        user.save()

        return Response({
            "message": "L'authentification à deux facteurs (2FA) est désormais activée.",
            "is_2fa_enabled": True
        }, status=status.HTTP_200_OK)


class TwoFactorDisableView(APIView):
    """
    Désactivation du 2FA avec confirmation du mot de passe.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        password = request.data.get('password', '')
        user = request.user

        if not password:
            return Response(
                {"detail": "Le mot de passe actuel est requis pour désactiver le 2FA."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not user.check_password(password):
            return Response(
                {"detail": "Mot de passe incorrect."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.is_2fa_enabled = False
        user.save()

        return Response({
            "message": "L'authentification à deux facteurs (2FA) a été désactivée.",
            "is_2fa_enabled": False
        }, status=status.HTTP_200_OK)


# ==============================================================================
# Mot de passe oublié (Forgot Password)
# ==============================================================================

class PasswordResetRequestView(APIView):
    """
    Demande de réinitialisation de mot de passe par email.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        dev_code = None

        try:
            user = User.objects.get(email=email)
            if user.is_active:
                code = generate_6_digit_code()
                dev_code = code

                # Invalider anciens codes
                PasswordResetOTP.objects.filter(user=user, is_used=False).update(is_used=True)
                PasswordResetOTP.objects.create(user=user, code=code)

                subject = "Alerta - Réinitialisation de votre mot de passe"
                message = (
                    f"Bonjour {user.first_name or 'Utilisateur'},\n\n"
                    f"Nous avons reçu une demande de réinitialisation de votre mot de passe Alerta.\n"
                    f"Voici votre code de sécurité à 6 chiffres :\n\n"
                    f"  >>> {code} <<<\n\n"
                    f"Ce code est valable pendant 15 minutes.\n"
                    f"Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.\n\n"
                    f"L'équipe Alerta Security"
                )
                try:
                    send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=True)
                except Exception as e:
                    print("Erreur envoi reset password email:", e)
        except User.DoesNotExist:
            pass # Réponse générique pour éviter la fuite d'adresses email (bonne pratique sécurité)

        resp = {
            "message": "Si cette adresse est enregistrée sur Alerta, un code de réinitialisation à 6 chiffres vous a été envoyé."
        }
        if settings.DEBUG and dev_code:
            resp["dev_code"] = dev_code

        return Response(resp, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    """
    Validation du code reçu et définition du nouveau mot de passe.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        code = serializer.validated_data['code']
        new_password = serializer.validated_data['new_password']

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {"detail": "Demande invalide ou code expiré."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            otp = PasswordResetOTP.objects.filter(user=user, code=code, is_used=False).latest('created_at')
        except PasswordResetOTP.DoesNotExist:
            return Response(
                {"detail": "Code de réinitialisation invalide."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not otp.is_valid():
            return Response(
                {"detail": "Ce code de réinitialisation a expiré."},
                status=status.HTTP_400_BAD_REQUEST
            )

        otp.is_used = True
        otp.save()

        user.set_password(new_password)
        user.save()

        return Response({
            "message": "Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter."
        }, status=status.HTTP_200_OK)


# ==============================================================================
# Inscription, Profil & Suppression de compte
# ==============================================================================

class RegisterView(generics.CreateAPIView):
    """
    Inscription d'un nouvel utilisateur.
    """
    queryset = User.objects.all()
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        user_data = UserSerializer(user, context={'request': request}).data
        return Response(
            {
                "message": "Compte créé avec succès.",
                "user": user_data
            },
            status=status.HTTP_201_CREATED
        )


class UserProfileView(generics.RetrieveUpdateAPIView):
    """
    Consultation (GET) et modification (PUT / PATCH) du profil de l'utilisateur connecté,
    avec prise en charge de l'upload d'image de profil (multipart).
    """
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    """
    Changement sécurisé du mot de passe pour l'utilisateur connecté.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        user = request.user
        user.set_password(serializer.validated_data['new_password'])
        user.save()

        return Response(
            {"message": "Mot de passe modifié avec succès."},
            status=status.HTTP_200_OK
        )


class DeleteAccountView(APIView):
    """
    Suppression définitive de son propre compte par l'utilisateur connecté.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = DeleteAccountSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        user = request.user

        # Protection : Empêcher la suppression du seul admin
        if user.role == 'admin':
            admin_count = User.objects.filter(role='admin', is_active=True).count()
            if admin_count <= 1:
                return Response(
                    {"detail": "Impossible de supprimer le dernier compte administrateur actif du système."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        user_email = user.email
        user.delete()

        return Response(
            {"message": f"Le compte associé à {user_email} a été supprimé définitivement."},
            status=status.HTTP_200_OK
        )


class LogoutView(APIView):
    """
    Déconnexion : blacklist du refresh token fourni.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"error": "Le jeton 'refresh' est obligatoire pour la déconnexion."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(
                {"message": "Déconnexion réussie (jeton invalidé)."},
                status=status.HTTP_200_OK
            )
        except TokenError as e:
            return Response(
                {"error": f"Jeton invalide ou déjà révoqué : {str(e)}"},
                status=status.HTTP_400_BAD_REQUEST
            )


# ==============================================================================
# Vues d'administration (Module Membre 1 - Gestion des comptes & activation)
# ==============================================================================

class AdminUserListView(generics.ListAPIView):
    """
    Liste de tous les utilisateurs pour l'administrateur.
    Supporte les filtres : ?search=..., ?role=..., ?is_active=true/false
    """
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdminUserRole]

    def get_queryset(self):
        queryset = User.objects.all().order_by('-date_inscription')
        search = self.request.query_params.get('search', '').strip()
        role = self.request.query_params.get('role', '').strip()
        is_active = self.request.query_params.get('is_active', '').strip()

        if search:
            queryset = queryset.filter(
                models.Q(email__icontains=search) |
                models.Q(first_name__icontains=search) |
                models.Q(last_name__icontains=search)
            )

        if role in ['admin', 'user']:
            queryset = queryset.filter(role=role)

        if is_active.lower() in ['true', '1']:
            queryset = queryset.filter(is_active=True)
        elif is_active.lower() in ['false', '0']:
            queryset = queryset.filter(is_active=False)

        return queryset


class AdminUserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Détail, mise à jour ou suppression d'un utilisateur (réservé aux admins).
    """
    queryset = User.objects.all()
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdminUserRole]

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise permissions.exceptions.PermissionDenied(
                "Vous ne pouvez pas supprimer votre propre compte administrateur."
            )
        instance.delete()


class AdminToggleUserStatusView(APIView):
    """
    Activer ou désactiver un compte utilisateur (bascule is_active).
    """
    permission_classes = [IsAdminUserRole]

    def post(self, request, pk):
        try:
            target_user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response(
                {"error": "Utilisateur introuvable."},
                status=status.HTTP_404_NOT_FOUND
            )

        if target_user == request.user:
            return Response(
                {"error": "Vous ne pouvez pas désactiver votre propre compte administrateur."},
                status=status.HTTP_400_BAD_REQUEST
            )

        target_user.is_active = not target_user.is_active
        target_user.save()

        action = "activé" if target_user.is_active else "désactivé"
        return Response(
            {
                "message": f"Le compte de {target_user.email} a été {action}.",
                "is_active": target_user.is_active,
                "user": AdminUserSerializer(target_user, context={'request': request}).data
            },
            status=status.HTTP_200_OK
        )


class AdminStatsView(APIView):
    """
    Statistiques d'administration globales.
    """
    permission_classes = [IsAdminUserRole]

    def get(self, request):
        total_users = User.objects.count()
        active_users = User.objects.filter(is_active=True).count()
        inactive_users = User.objects.filter(is_active=False).count()
        admin_users = User.objects.filter(role='admin').count()
        standard_users = User.objects.filter(role='user').count()
        two_factor_users = User.objects.filter(is_2fa_enabled=True).count()

        return Response(
            {
                "total_users": total_users,
                "active_users": active_users,
                "inactive_users": inactive_users,
                "admin_users": admin_users,
                "standard_users": standard_users,
                "two_factor_users": two_factor_users,
            },
            status=status.HTTP_200_OK
        )
