from django.contrib import admin

from .models import FloorPlan, Project


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'budget', 'currency', 'created_at')
    search_fields = ('name', 'owner__email')


@admin.register(FloorPlan)
class FloorPlanAdmin(admin.ModelAdmin):
    list_display = ('original_filename', 'project', 'page_count', 'selected_page', 'created_at')
    readonly_fields = ('sha256', 'file_size', 'image_width', 'image_height', 'render_dpi')
