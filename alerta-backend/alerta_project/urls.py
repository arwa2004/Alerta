from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse

def api_home(request):
    html_content = """
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Alerta API - Serveur Actif</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b0f19; color: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .card { background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 2.5rem; max-width: 520px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); text-align: center; }
            .badge { display: inline-block; background: #064e3b; color: #34d399; font-weight: 600; font-size: 0.8rem; padding: 4px 12px; border-radius: 9999px; margin-bottom: 1rem; }
            h1 { font-size: 1.8rem; font-weight: 700; margin: 0 0 0.5rem; color: #ffffff; }
            p { color: #9ca3af; font-size: 0.95rem; margin-bottom: 1.8rem; line-height: 1.5; }
            .links { display: flex; flex-direction: column; gap: 0.75rem; text-align: left; }
            .btn { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1.25rem; border-radius: 10px; text-decoration: none; font-weight: 500; font-size: 0.95rem; transition: all 0.2s; }
            .btn-primary { background: #4f46e5; color: #ffffff; }
            .btn-primary:hover { background: #4338ca; }
            .btn-secondary { background: #1f2937; color: #e5e7eb; border: 1px solid #374151; }
            .btn-secondary:hover { background: #374151; }
        </style>
    </head>
    <body>
        <div class="card">
            <span class="badge">â— Backend En Ligne</span>
            <h1>Alerta API</h1>
            <p>Le serveur backend Django fonctionne parfaitement. Pour utiliser l'application graphique Alerta, ouvrez le frontend React.</p>
            <div class="links">
                <a class="btn btn-primary" href="http://localhost:5173" target="_blank">
                    <span>Ouvrir l'application Web (Frontend)</span>
                    <span>â†’</span>
                </a>
                <a class="btn btn-secondary" href="/admin/">
                    <span>Panneau Django Admin</span>
                    <span>â†’</span>
                </a>
            </div>
        </div>
    </body>
    </html>
    """
    return HttpResponse(html_content)

urlpatterns = [
    path('', api_home, name='api-home'),
    path('admin/', admin.site.urls),
    path('api/auth/', include('users.urls')),
    path('api/planner/', include('planner.urls')),
    path('api/recognition/', include('recognition.urls')),
    path('api/medias/', include('medias.urls')),
    path('api/', include('events.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
