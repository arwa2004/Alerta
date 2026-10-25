from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth.password_validation import validate_password
from django.core import exceptions
from .models import User

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Serializer JWT personnalisé :
    - Vérifie que le compte est bien actif
    - Ajoute les informations utilisateur dans le payload du token décodable
    - Renvoie un objet 'user' complet dans la réponse JSON de login
    """
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['id'] = user.id
        token['email'] = user.email
        token['first_name'] = user.first_name
        token['last_name'] = user.last_name
        token['role'] = user.role
        token['is_active'] = user.is_active
        token['is_2fa_enabled'] = user.is_2fa_enabled
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        
        if not self.user.is_active:
            raise AuthenticationFailed("Ce compte a été désactivé par un administrateur.")
            
        data['user'] = {
            'id': self.user.id,
            'email': self.user.email,
            'first_name': self.user.first_name,
            'last_name': self.user.last_name,
            'phone_number': self.user.phone_number,
            'profile_picture': self.user.profile_picture.url if self.user.profile_picture else None,
            'is_2fa_enabled': self.user.is_2fa_enabled,
            'role': self.user.role,
            'is_active': self.user.is_active,
            'date_inscription': self.user.date_inscription.isoformat() if self.user.date_inscription else None,
        }
        return data


class UserSerializer(serializers.ModelSerializer):
    """
    Serializer pour l'utilisateur standard (consultation et modification de son propre profil).
    """
    profile_picture_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'phone_number',
            'profile_picture', 'profile_picture_url', 'is_2fa_enabled',
            'role', 'is_active', 'date_inscription'
        ]
        read_only_fields = ['id', 'email', 'role', 'is_active', 'date_inscription', 'is_2fa_enabled']

    def get_profile_picture_url(self, obj):
        if obj.profile_picture:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.profile_picture.url)
            return obj.profile_picture.url
        return None


class AdminUserSerializer(serializers.ModelSerializer):
    """
    Serializer pour l'administrateur (gestion complète des comptes utilisateurs).
    """
    profile_picture_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'phone_number',
            'profile_picture', 'profile_picture_url', 'is_2fa_enabled',
            'role', 'is_active', 'date_inscription'
        ]
        read_only_fields = ['id', 'date_inscription']

    def get_profile_picture_url(self, obj):
        if obj.profile_picture:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.profile_picture.url)
            return obj.profile_picture.url
        return None

    def validate_email(self, value):
        value = value.lower().strip()
        user = self.instance
        if User.objects.filter(email=value).exclude(pk=user.pk if user else None).exists():
            raise serializers.ValidationError("Un utilisateur avec cette adresse email existe déjà.")
        return value


class RegisterSerializer(serializers.ModelSerializer):
    """
    Serializer d'inscription avec confirmation et validation robuste du mot de passe.
    """
    password = serializers.CharField(write_only=True, required=True, style={'input_type': 'password'})
    password_confirm = serializers.CharField(write_only=True, required=True, style={'input_type': 'password'})

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'phone_number', 'password', 'password_confirm', 'role', 'date_inscription']
        read_only_fields = ['id', 'date_inscription']
        extra_kwargs = {
            'role': {'required': False, 'default': 'user'}
        }

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Un compte avec cette adresse email existe déjà.")
        return value

    def validate(self, attrs):
        password = attrs.get('password')
        password_confirm = attrs.get('password_confirm')

        if password != password_confirm:
            raise serializers.ValidationError({"password_confirm": "Les mots de passe ne correspondent pas."})

        try:
            validate_password(password)
        except exceptions.ValidationError as err:
            raise serializers.ValidationError({"password": list(err.messages)})

        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm', None)
        role = validated_data.pop('role', 'user')
        if role not in ['user', 'admin']:
            role = 'user'

        user = User.objects.create_user(
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            phone_number=validated_data.get('phone_number', ''),
            role=role
        )
        return user


class ChangePasswordSerializer(serializers.Serializer):
    """
    Serializer pour le changement de mot de passe du profil connecté.
    """
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True)
    new_password_confirm = serializers.CharField(required=True, write_only=True)

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("L'ancien mot de passe est incorrect.")
        return value

    def validate(self, attrs):
        new_password = attrs.get('new_password')
        new_password_confirm = attrs.get('new_password_confirm')

        if new_password != new_password_confirm:
            raise serializers.ValidationError({"new_password_confirm": "Le nouveau mot de passe et sa confirmation ne correspondent pas."})

        if attrs.get('old_password') == new_password:
            raise serializers.ValidationError({"new_password": "Le nouveau mot de passe doit être différent de l'ancien."})

        try:
            validate_password(new_password, user=self.context['request'].user)
        except exceptions.ValidationError as err:
            raise serializers.ValidationError({"new_password": list(err.messages)})

        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    """
    Demande de réinitialisation de mot de passe (envoi code 6 chiffres).
    """
    email = serializers.EmailField(required=True)

    def validate_email(self, value):
        return value.lower().strip()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """
    Validation du code et changement effectif du mot de passe oublié.
    """
    email = serializers.EmailField(required=True)
    code = serializers.CharField(required=True, max_length=6, min_length=6)
    new_password = serializers.CharField(required=True, write_only=True)
    new_password_confirm = serializers.CharField(required=True, write_only=True)

    def validate(self, attrs):
        new_password = attrs.get('new_password')
        new_password_confirm = attrs.get('new_password_confirm')

        if new_password != new_password_confirm:
            raise serializers.ValidationError({"new_password_confirm": "Les mots de passe ne correspondent pas."})

        try:
            validate_password(new_password)
        except exceptions.ValidationError as err:
            raise serializers.ValidationError({"new_password": list(err.messages)})

        return attrs


class TwoFactorVerifySerializer(serializers.Serializer):
    """
    Validation du code pour activer le 2FA.
    """
    code = serializers.CharField(required=True, max_length=6, min_length=6)


class TwoFactorLoginVerifySerializer(serializers.Serializer):
    """
    Vérification finale du code 2FA lors de la connexion.
    """
    temp_token = serializers.CharField(required=True)
    code = serializers.CharField(required=True, max_length=6, min_length=6)


class DeleteAccountSerializer(serializers.Serializer):
    """
    Confirmation du mot de passe pour supprimer son compte.
    """
    password = serializers.CharField(required=True, write_only=True)

    def validate_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("Mot de passe incorrect.")
        return value
