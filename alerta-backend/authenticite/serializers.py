import os

from rest_framework import serializers

from .models import AnalyseAuthenticite as A

EXT_PHOTO = {".jpg", ".jpeg", ".png"}
EXT_VIDEO = {".mp4", ".avi", ".mov", ".mkv"}
MAX_PHOTO = 10 * 1024 * 1024
MAX_VIDEO = 200 * 1024 * 1024


class AnalyseSerializer(serializers.ModelSerializer):
    class Meta:
        model = A
        fields = ["id", "fichier", "nom_original", "type", "taille", "media_source", "statut", "message_erreur",
                  "score", "verdict", "carte_ela", "date_upload", "date_fin"]
        read_only_fields = ["id", "nom_original", "type", "taille", "media_source", "statut", "message_erreur",
                            "score", "verdict", "carte_ela", "date_upload", "date_fin"]

    def validate_fichier(self, f):
        ext = os.path.splitext(f.name)[1].lower()
        if ext in EXT_PHOTO:
            if f.size > MAX_PHOTO:
                raise serializers.ValidationError("Photo trop lourde (10 Mo maximum).")
        elif ext in EXT_VIDEO:
            if f.size > MAX_VIDEO:
                raise serializers.ValidationError("Vidéo trop lourde (200 Mo maximum).")
        else:
            raise serializers.ValidationError("Format non pris en charge (JPG, PNG, MP4, AVI, MOV, MKV).")
        return f

    def create(self, validated_data):
        f = validated_data["fichier"]
        ext = os.path.splitext(f.name)[1].lower()
        validated_data.update(
            owner=self.context["request"].user,
            nom_original=f.name,
            taille=f.size,
            type=A.Type.PHOTO if ext in EXT_PHOTO else A.Type.VIDEO,
        )
        return super().create(validated_data)


class AnalyseDetailSerializer(AnalyseSerializer):
    class Meta(AnalyseSerializer.Meta):
        fields = AnalyseSerializer.Meta.fields + ["details"]
        read_only_fields = AnalyseSerializer.Meta.read_only_fields + ["details"]


class AdminAnalyseSerializer(AnalyseSerializer):
    owner_email = serializers.CharField(source="owner.email", read_only=True)
    owner_nom = serializers.SerializerMethodField()

    class Meta(AnalyseSerializer.Meta):
        fields = AnalyseSerializer.Meta.fields + ["owner", "owner_email", "owner_nom"]
        read_only_fields = fields

    def get_owner_nom(self, obj):
        nom = f"{obj.owner.first_name} {obj.owner.last_name}".strip()
        return nom or obj.owner.email


class AdminAnalyseDetailSerializer(AdminAnalyseSerializer):
    class Meta(AdminAnalyseSerializer.Meta):
        fields = AdminAnalyseSerializer.Meta.fields + ["details"]
        read_only_fields = fields