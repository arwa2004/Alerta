import sys, os, inspect
proj='C:/dev/django/Alerta/alerta-backend'
sys.path.append(proj)
from recognition import services
print(inspect.getsource(services.identify_video_faces))
