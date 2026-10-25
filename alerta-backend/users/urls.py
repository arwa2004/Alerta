from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterView,
    CustomLoginView,
    UserProfileView,
    ChangePasswordView,
    DeleteAccountView,
    LogoutView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    TwoFactorLoginVerifyView,
    TwoFactorRequestEnableView,
    TwoFactorConfirmEnableView,
    TwoFactorDisableView,
    AdminUserListView,
    AdminUserDetailView,
    AdminToggleUserStatusView,
    AdminStatsView,
)

urlpatterns = [
    # Authentification principale
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', CustomLoginView.as_view(), name='login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', LogoutView.as_view(), name='logout'),

    # Profil & Gestion du compte
    path('profile/', UserProfileView.as_view(), name='profile'),
    path('change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('delete-account/', DeleteAccountView.as_view(), name='delete_account'),

    # Mot de passe oublié (Forgot password)
    path('password-reset/request/', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),

    # Authentification à deux facteurs (2FA)
    path('2fa/login-verify/', TwoFactorLoginVerifyView.as_view(), name='two_factor_login_verify'),
    path('2fa/enable-request/', TwoFactorRequestEnableView.as_view(), name='two_factor_enable_request'),
    path('2fa/enable-confirm/', TwoFactorConfirmEnableView.as_view(), name='two_factor_enable_confirm'),
    path('2fa/disable/', TwoFactorDisableView.as_view(), name='two_factor_disable'),

    # Administration des utilisateurs (Module 1 / Admin)
    path('stats/', AdminStatsView.as_view(), name='admin_stats'),
    path('users/', AdminUserListView.as_view(), name='admin_user_list'),
    path('users/<int:pk>/', AdminUserDetailView.as_view(), name='admin_user_detail'),
    path('users/<int:pk>/toggle-status/', AdminToggleUserStatusView.as_view(), name='admin_toggle_user_status'),
]
