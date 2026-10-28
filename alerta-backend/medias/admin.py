# medias/admin.py
from django.contrib import admin

from .models import Media


@admin.register(Media)
class MediaAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "zone", "type", "statut", "date_upload")
    list_filter = ("type", "statut", "zone")
    readonly_fields = ("resultats",)