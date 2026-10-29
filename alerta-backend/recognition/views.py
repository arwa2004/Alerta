import mimetypes

from django.db.models import Count, Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from . import engine, quality, services
from .models import Face, KnownPerson, SurveillanceVideo, Zone
from .serializers import (MIN_PHOTOS, AddFacesSerializer, FaceSerializer,
                          KnownPersonCreateSerializer, KnownPersonSerializer,
                          SurveillanceVideoSerializer, ZoneSerializer)


class ZoneViewSet(viewsets.ModelViewSet):
    """CRUD des zones. Toujours filtré sur request.user (isolation des données)."""
    serializer_class = ZoneSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (Zone.objects.filter(owner=self.request.user)
                .annotate(persons_count=Count('persons', distinct=True)))

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=['post'], url_path='identify',
            parser_classes=[MultiPartParser, FormParser])
    def identify(self, request, pk=None):
        """Teste la reconnaissance : envoie une image OU une vidéo, renvoie chaque visage identifié."""
        zone = self.get_object()
        upload = request.FILES.get('file') or request.FILES.get('image')
        if upload is None:
            return Response({'detail': "Joignez un fichier image ou vidéo (champ « file » ou « image »)."},
                            status=status.HTTP_400_BAD_REQUEST)

        filename = (upload.name or '').lower()
        video_exts = ('.mp4', '.avi', '.mov', '.webm', '.mkv')
        is_video = filename.endswith(video_exts) or (upload.content_type and upload.content_type.startswith('video/'))

        max_size = 150 * 1024 * 1024 if is_video else quality.MAX_FILE_BYTES
        if upload.size > max_size:
            max_mb = 150 if is_video else 5
            return Response({'detail': f"Fichier trop lourd ({max_mb} Mo maximum)."},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            if is_video:
                import os
                import uuid
                ext = os.path.splitext(filename)[1] or '.mp4'

                # 1. Sauvegarde permanente de la vidéo dans media/videos/
                video_obj = SurveillanceVideo.objects.create(
                    zone=zone,
                    uploaded_by=request.user,
                    video_file=upload,
                    original_filename=upload.name or f"video_{uuid.uuid4().hex[:8]}{ext}",
                )

                # 2. Analyse IA sur le fichier vidéo stocké
                report = services.identify_video_faces(zone, video_obj.video_file.path)

                # 3. Sauvegarde des métadonnées (personnes connues et inconnues détectées)
                video_obj.duration_seconds = report.get('duration_seconds', 0.0)
                video_obj.alert_triggered = report.get('alert_triggered', False)
                video_obj.known_persons_names = report.get('known_persons', [])
                video_obj.known_snapshots = report.get('known_snapshots', [])
                video_obj.unknown_count = len(report.get('unknown_snapshots', []))
                video_obj.unknown_snapshots = report.get('unknown_snapshots', [])
                video_obj.timeline = report.get('timeline', [])
                video_obj.save()

                if video_obj.known_persons_names:
                    known_objs = KnownPerson.objects.filter(
                        owner=request.user,
                        full_name__in=video_obj.known_persons_names
                    )
                    video_obj.known_persons.set(known_objs)

                # 4. Enrichissement du rapport retourné au client
                report['video_id'] = video_obj.id
                report['video_url'] = request.build_absolute_uri(video_obj.video_file.url)
                report['saved'] = True
                report['saved_at'] = video_obj.created_at.isoformat()

                return Response(report)
            else:
                data = upload.read()
                results = services.identify_all_faces(zone, data)
                faces = []
                for (top, right, bottom, left), match in results:
                    faces.append({
                        'box': {'top': top, 'right': right, 'bottom': bottom, 'left': left},
                        'is_known': match.is_known,
                        'person': ({'id': match.person.id, 'full_name': match.person.full_name,
                                    'status': match.person.status} if match.person else None),
                        'distance': match.distance,
                        'confidence': match.confidence,
                        'should_alert': match.should_alert,
                    })
                return Response({'type': 'image', 'zone': zone.id, 'count': len(faces), 'faces': faces})
        except quality.PhotoRejected as exc:
            return Response({'detail': f"Fichier refusé : {exc}"}, status=status.HTTP_400_BAD_REQUEST)
        except services.ZoneInactive as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_409_CONFLICT)
        except engine.FaceEngineUnavailable as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as exc:
            return Response({'detail': f"Erreur lors de l'analyse : {exc}"}, status=status.HTTP_400_BAD_REQUEST)


class KnownPersonViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = (KnownPerson.objects.filter(owner=self.request.user)
              .prefetch_related('zones', 'faces'))
        params = self.request.query_params
        if params.get('zone', '').isdigit():
            qs = qs.filter(zones__id=int(params['zone']))
        if params.get('status') in KnownPerson.Status.values:
            qs = qs.filter(status=params['status'])
        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(full_name__icontains=search) | Q(relation__icontains=search))
        return qs.distinct()

    def get_serializer_class(self):
        return KnownPersonCreateSerializer if self.action == 'create' else KnownPersonSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        person = serializer.save(owner=request.user)
        data = KnownPersonSerializer(person, context=self.get_serializer_context()).data
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='faces')
    def add_faces(self, request, pk=None):
        person = self.get_object()
        serializer = AddFacesSerializer(data=request.data, context={'person': person, 'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        person = self.get_queryset().get(pk=person.pk)
        return Response(KnownPersonSerializer(person, context=self.get_serializer_context()).data,
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'faces/(?P<face_id>[0-9]+)')
    def remove_face(self, request, pk=None, face_id=None):
        person = self.get_object()
        face = get_object_or_404(person.faces, pk=face_id)
        if person.faces.count() <= MIN_PHOTOS:
            return Response(
                {'detail': f"Une personne doit garder au moins {MIN_PHOTOS} photos. "
                           f"Ajoutez-en une autre avant de supprimer celle-ci."},
                status=status.HTTP_400_BAD_REQUEST)
        face.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FaceImageView(APIView):
    """Sert la photo uniquement à son propriétaire (jamais d'accès public ni admin)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        face = get_object_or_404(Face, pk=pk, person__owner=request.user)
        content_type = mimetypes.guess_type(face.image.name)[0] or 'application/octet-stream'
        return FileResponse(face.image.open('rb'), content_type=content_type)


class SurveillanceVideoViewSet(viewsets.ModelViewSet):
    """Accès aux vidéos de surveillance enregistrées dans media/ avec leurs personnes identifiées."""
    serializer_class = SurveillanceVideoSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = (SurveillanceVideo.objects.filter(uploaded_by=self.request.user)
              .select_related('zone')
              .prefetch_related('known_persons'))
        zone_id = self.request.query_params.get('zone')
        if zone_id and zone_id.isdigit():
            qs = qs.filter(zone_id=int(zone_id))
        alert = self.request.query_params.get('alert')
        if alert is not None:
            if alert.lower() in ('true', '1'):
                qs = qs.filter(alert_triggered=True)
            elif alert.lower() in ('false', '0'):
                qs = qs.filter(alert_triggered=False)
        return qs

    @action(detail=False, methods=['post'], url_path='search-unknown')
    def search_unknown(self, request):
        """Recherche les apparitions d'un individu inconnu dans toutes les vidéos de toutes les zones."""
        video_id = request.data.get('video_id')
        unknown_index = request.data.get('unknown_index')
        thumbnail = request.data.get('thumbnail')
        raw_th = request.data.get('threshold')
        threshold = float(raw_th) if raw_th is not None else 0.50

        try:
            results = services.search_unknown_across_videos(
                user=request.user,
                video_id=int(video_id) if video_id is not None else None,
                unknown_index=int(unknown_index) if unknown_index is not None else None,
                thumbnail=thumbnail,
                threshold=threshold,
            )
            for m in results.get('matches', []):
                if m.get('video_url'):
                    m['video_url'] = request.build_absolute_uri(m['video_url'])
            return Response(results)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response({'detail': f"Erreur lors de la recherche : {exc}"}, status=status.HTTP_400_BAD_REQUEST)
