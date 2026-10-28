from rest_framework import serializers

from .models import Media
from .validators import valider_fichier


class MediaSerializer(serializers.ModelSerializer):
    zone_nom = serializers.CharField(source="zone.name", read_only=True)
    nb_visages = serializers.SerializerMethodField()
    alerte = serializers.SerializerMethodField()

    class Meta:
        model = Media
        fields = ["id", "zone", "zone_nom", "fichier", "nom_original", "type", "statut",
                  "taille", "date_upload", "date_traitement", "nb_visages", "alerte",
                  "message_erreur"]
        read_only_fields = ["id", "nom_original", "type", "statut", "taille", "date_upload",
                            "date_traitement", "message_erreur"]

    def get_nb_visages(self, obj):
        return (obj.resultats or {}).get("total_detections", 0)

    def get_alerte(self, obj):
        return (obj.resultats or {}).get("alert_triggered", False)

    def validate_zone(self, zone):
        # Isolation des données : on ne peut uploader que dans SES zones
        if zone.owner_id != self.context["request"].user.id:
            raise serializers.ValidationError("Zone introuvable.")
        if not zone.is_active:
            raise serializers.ValidationError("Cette zone est désactivée.")
        return zone

    def validate_fichier(self, fichier):
        self._type_media = valider_fichier(fichier)
        return fichier

    def create(self, validated_data):
        fichier = validated_data["fichier"]
        return Media.objects.create(
            owner=self.context["request"].user,
            type=self._type_media,
            taille=fichier.size,
            nom_original=fichier.name[:255],
            **validated_data,
        )


class MediaDetailSerializer(MediaSerializer):
    """Ajoute le résultat complet de l'analyse (vignettes comprises)."""

    class Meta(MediaSerializer.Meta):
        fields = MediaSerializer.Meta.fields + ["resultats"]
        read_only_fields = MediaSerializer.Meta.read_only_fields + ["resultats"]

class AdminMediaSerializer(MediaSerializer):
    """Vue administrateur : ajoute le propriétaire. Lecture seule."""
    owner_email = serializers.CharField(source="owner.email", read_only=True)
    owner_nom = serializers.SerializerMethodField()

    class Meta(MediaSerializer.Meta):
        fields = MediaSerializer.Meta.fields + ["owner", "owner_email", "owner_nom"]
        read_only_fields = fields

    def get_owner_nom(self, obj):
        nom = f"{obj.owner.first_name} {obj.owner.last_name}".strip()
        return nom or obj.owner.email


class AdminMediaDetailSerializer(AdminMediaSerializer):
    """Ajoute le résultat complet de l'analyse."""

    class Meta(AdminMediaSerializer.Meta):
        fields = AdminMediaSerializer.Meta.fields + ["resultats"]
        read_only_fields = fields