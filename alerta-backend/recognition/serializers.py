from django.db import transaction
from django.urls import reverse
from rest_framework import serializers

from . import engine, quality
from .models import Face, KnownPerson, Zone

MIN_PHOTOS = 3
MAX_PHOTOS = 10


class ZoneSerializer(serializers.ModelSerializer):
    persons_count = serializers.SerializerMethodField()

    class Meta:
        model = Zone
        fields = ['id', 'name', 'description', 'camera_source', 'is_active',
                  'threshold', 'persons_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_persons_count(self, obj):
        annotated = getattr(obj, 'persons_count', None)
        return annotated if annotated is not None else obj.persons.count()

    def validate_name(self, value):
        value = value.strip()
        qs = Zone.objects.filter(owner=self.context['request'].user, name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Vous avez déjà une zone portant ce nom.")
        return value


class FaceSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Face
        fields = ['id', 'image_url', 'quality_score', 'created_at']

    def get_image_url(self, obj):
        request = self.context.get('request')
        path = reverse('face_image', kwargs={'pk': obj.pk})
        return request.build_absolute_uri(path) if request else path


class KnownPersonSerializer(serializers.ModelSerializer):
    zones = serializers.PrimaryKeyRelatedField(many=True, queryset=Zone.objects.none(), required=False)
    faces = FaceSerializer(many=True, read_only=True)
    faces_count = serializers.IntegerField(source='faces.count', read_only=True)
    is_valid_now = serializers.BooleanField(read_only=True)

    class Meta:
        model = KnownPerson
        fields = ['id', 'full_name', 'status', 'relation', 'consent', 'consent_date',
                  'valid_from', 'valid_to', 'is_valid_now', 'zones', 'faces', 'faces_count',
                  'created_at']
        read_only_fields = ['id', 'consent_date', 'created_at']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request is not None and 'zones' in self.fields:
            # Isolation : on ne peut rattacher une personne qu'à ses propres zones.
            self.fields['zones'].child_relation.queryset = Zone.objects.filter(owner=request.user)

    def to_internal_value(self, data):
        # Support des envois multipart/form-data et conversion sécurisée en listes
        if hasattr(data, 'getlist'):
            mutable = data.dict()
            if 'zones' in data:
                mutable['zones'] = [z for z in data.getlist('zones') if z]
            files_list = data.getlist('images') if 'images' in data else []
            req = self.context.get('request')
            if not files_list and req and hasattr(req, 'FILES'):
                files_list = req.FILES.getlist('images')
            if files_list:
                mutable['images'] = files_list
            data = mutable
        elif isinstance(data, dict):
            if 'zones' in data and not isinstance(data['zones'], (list, tuple, set)):
                data = data.copy()
                data['zones'] = [data['zones']] if data['zones'] else []
        return super().to_internal_value(data)

    def validate(self, attrs):
        start = attrs.get('valid_from', getattr(self.instance, 'valid_from', None))
        end = attrs.get('valid_to', getattr(self.instance, 'valid_to', None))
        if start and end and end <= start:
            raise serializers.ValidationError(
                {'valid_to': "La fin de validité doit être postérieure au début."}
            )
        return attrs


class KnownPersonCreateSerializer(KnownPersonSerializer):
    images = serializers.ListField(
        child=serializers.ImageField(), write_only=True,
        min_length=MIN_PHOTOS, max_length=MAX_PHOTOS,
        error_messages={'min_length': f"Ajoutez au moins {MIN_PHOTOS} photos.",
                        'max_length': f"{MAX_PHOTOS} photos maximum."},
    )

    class Meta(KnownPersonSerializer.Meta):
        fields = KnownPersonSerializer.Meta.fields + ['images']

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError(
                "Le consentement de la personne est obligatoire pour enregistrer son visage."
            )
        return value

    def validate_images(self, files):
        try:
            self._analyses = quality.analyze_batch(files)
        except quality.PhotoBatchRejected as exc:
            raise serializers.ValidationError(exc.errors)
        except engine.FaceEngineUnavailable as exc:
            raise serializers.ValidationError(str(exc))
        self._files = files
        return files

    @transaction.atomic
    def create(self, validated_data):
        validated_data.pop('images')
        zones = validated_data.pop('zones', [])
        person = KnownPerson.objects.create(**validated_data)
        person.zones.set(zones)
        for upload, analysis in zip(self._files, self._analyses):
            Face.objects.create(
                person=person, image=upload, encoding=analysis.encoding,
                quality_score=analysis.quality_score, image_hash=analysis.sha256,
            )
        return person


class AddFacesSerializer(serializers.Serializer):
    images = serializers.ListField(child=serializers.ImageField(), min_length=1, max_length=MAX_PHOTOS)

    def to_internal_value(self, data):
        if hasattr(data, 'getlist'):
            mutable = data.dict()
            files_list = data.getlist('images') if 'images' in data else []
            req = self.context.get('request')
            if not files_list and req and hasattr(req, 'FILES'):
                files_list = req.FILES.getlist('images')
            if files_list:
                mutable['images'] = files_list
            data = mutable
        return super().to_internal_value(data)

    def validate_images(self, files):
        person = self.context['person']
        existing = list(person.faces.values_list('encoding', 'image_hash'))
        if len(existing) + len(files) > MAX_PHOTOS:
            raise serializers.ValidationError(
                f"Une personne ne peut avoir plus de {MAX_PHOTOS} photos."
            )
        try:
            self._analyses = quality.analyze_batch(
                files,
                existing_encodings=[e for e, _ in existing],
                existing_hashes=[h for _, h in existing],
            )
        except quality.PhotoBatchRejected as exc:
            raise serializers.ValidationError(exc.errors)
        except engine.FaceEngineUnavailable as exc:
            raise serializers.ValidationError(str(exc))
        self._files = files
        return files

    @transaction.atomic
    def save(self, **kwargs):
        person = self.context['person']
        return [
            Face.objects.create(person=person, image=up, encoding=a.encoding,
                                quality_score=a.quality_score, image_hash=a.sha256)
            for up, a in zip(self._files, self._analyses)
        ]
