from django.core.exceptions import ObjectDoesNotExist
from django.db.models.signals import m2m_changed, post_delete, post_save
from django.dispatch import receiver

from .models import Face, KnownPerson, Zone
from .services import invalidate_owner


@receiver([post_save, post_delete], sender=Face)
def face_changed(sender, instance, **kwargs):
    try:
        invalidate_owner(instance.person.owner_id)
    except ObjectDoesNotExist:   # suppression en cascade : la personne gère l'invalidation
        pass


@receiver([post_save, post_delete], sender=KnownPerson)
def person_changed(sender, instance, **kwargs):
    invalidate_owner(instance.owner_id)


@receiver([post_save, post_delete], sender=Zone)
def zone_changed(sender, instance, **kwargs):
    invalidate_owner(instance.owner_id)


@receiver(m2m_changed, sender=KnownPerson.zones.through)
def zones_changed(sender, instance, **kwargs):
    invalidate_owner(instance.owner_id)


@receiver(post_delete, sender=Face)
def delete_face_file(sender, instance, **kwargs):
    """Droit à l'effacement : le fichier image disparaît avec l'enregistrement."""
    if instance.image:
        instance.image.delete(save=False)
