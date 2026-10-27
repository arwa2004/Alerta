from rest_framework import serializers
from .models import Evenement, Zone

class ZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Zone
        fields = ['id', 'nom', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']


class EvenementSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    zone_detail = ZoneSerializer(source='zone', read_only=True)
    zone_nom = serializers.CharField(source='zone_affichee', read_only=True)
    type_display = serializers.CharField(source='get_type_display', read_only=True)
    niveau_criticite_display = serializers.CharField(source='get_niveau_criticite_display', read_only=True)

    class Meta:
        model = Evenement
        fields = [
            'id',
            'user',
            'user_email',
            'zone',
            'zone_detail',
            'zone_nom',
            'zone_nom_fallback',
            'type',
            'type_display',
            'personne_nom',
            'description',
            'description_source',
            'photo_capturee',
            'date_heure',
            'score_confiance',
            'score_criticite',
            'niveau_criticite',
            'niveau_criticite_display',
            'image_reconstituee',
            'image_source',
            'statut_ia',
            'alerte_declenchee',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'user',
            'user_email',
            'score_criticite',
            'niveau_criticite',
            'statut_ia',
            'alerte_declenchee',
            'created_at',
            'updated_at',
        ]


class EvenementCreateSerializer(serializers.ModelSerializer):
    """
    Serializer pour la création d'événement (utilisé par le Module 2 ou par simulation).
    """
    class Meta:
        model = Evenement
        fields = [
            'id',
            'zone',
            'zone_nom_fallback',
            'type',
            'personne_nom',
            'photo_capturee',
            'date_heure',
            'score_confiance',
        ]
        read_only_fields = ['id']
