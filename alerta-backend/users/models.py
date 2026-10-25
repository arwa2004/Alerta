from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone
from datetime import timedelta
from .managers import CustomUserManager

class User(AbstractUser):
    username = None
    email = models.EmailField(unique=True, verbose_name="Adresse email")
    
    ROLE_CHOICES = (
        ('admin', 'Admin'),
        ('user', 'Utilisateur'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='user', verbose_name="Rôle")
    date_inscription = models.DateTimeField(auto_now_add=True, verbose_name="Date d'inscription")

    # Champs additionnels complets du profil
    phone_number = models.CharField(max_length=25, blank=True, null=True, verbose_name="Numéro de téléphone")
    profile_picture = models.ImageField(upload_to='profiles/', blank=True, null=True, verbose_name="Photo de profil")
    is_2fa_enabled = models.BooleanField(default=False, verbose_name="Authentification à deux facteurs (2FA)")

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    objects = CustomUserManager()

    class Meta:
        verbose_name = "Utilisateur"
        verbose_name_plural = "Utilisateurs"
        ordering = ['-date_inscription']

    def __str__(self):
        full_name = self.get_full_name()
        return f"{full_name} ({self.email})" if full_name else self.email

    @property
    def is_admin_role(self):
        return self.role == 'admin' or self.is_staff or self.is_superuser


class PasswordResetOTP(models.Model):
    """
    Code OTP à 6 chiffres pour la réinitialisation de mot de passe oublié.
    Valide pendant 15 minutes.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_reset_otps')
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    is_used = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Code de réinitialisation mot de passe"
        ordering = ['-created_at']

    def is_valid(self):
        expiration = self.created_at + timedelta(minutes=15)
        return (not self.is_used) and (timezone.now() <= expiration)


class TwoFactorOTP(models.Model):
    """
    Code OTP à 6 chiffres pour l'authentification à deux facteurs (2FA).
    Valide pendant 10 minutes.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='two_factor_otps')
    code = models.CharField(max_length=6)
    temp_token = models.CharField(max_length=64, blank=True, null=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_used = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Code 2FA"
        ordering = ['-created_at']

    def is_valid(self):
        expiration = self.created_at + timedelta(minutes=10)
        return (not self.is_used) and (timezone.now() <= expiration)
