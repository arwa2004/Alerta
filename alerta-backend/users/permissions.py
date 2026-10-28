from rest_framework import permissions

class IsAdminUserRole(permissions.BasePermission):
    """
    Permission accordée uniquement aux utilisateurs ayant le rôle 'admin'
    ou le statut staff / superuser.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.is_admin_role
        )

class IsOwnerOrAdmin(permissions.BasePermission):
    """
    Permission permettant au propriétaire d'un compte ou d'un objet (ex: Événement)
    de modifier ses données, ou à un administrateur d'y accéder.
    """
    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_admin_role:
            return True
        owner = getattr(obj, 'user', obj)
        return owner == request.user
