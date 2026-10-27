"""Validation d'un PDF uploadé et rendu d'une page en image PNG (PyMuPDF)."""
import hashlib
from dataclasses import dataclass

import pymupdf
from django.conf import settings


class PDFValidationError(Exception):
    """Erreur de validation affichable à l'utilisateur."""


@dataclass
class RenderedPage:
    png_bytes: bytes
    width: int
    height: int
    dpi: int


def read_and_validate_pdf(uploaded_file):
    """
    Lit le fichier (en mémoire, plafonné) et vérifie : extension, taille,
    signature %PDF-, lisibilité par PyMuPDF, non chiffré, nombre de pages.
    Retourne (bytes, sha256, page_count).
    """
    name = (getattr(uploaded_file, 'name', '') or '').lower()
    if not name.endswith('.pdf'):
        raise PDFValidationError("Le fichier doit avoir l'extension .pdf.")

    max_bytes = settings.PLANNER_MAX_UPLOAD_MB * 1024 * 1024
    if uploaded_file.size > max_bytes:
        raise PDFValidationError(f"Fichier trop volumineux (maximum {settings.PLANNER_MAX_UPLOAD_MB} Mo).")
    if uploaded_file.size == 0:
        raise PDFValidationError("Le fichier est vide.")

    uploaded_file.seek(0)
    data = uploaded_file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise PDFValidationError(f"Fichier trop volumineux (maximum {settings.PLANNER_MAX_UPLOAD_MB} Mo).")

    # La signature peut être précédée de quelques octets de bruit (spec PDF : 1024 premiers octets).
    if b'%PDF-' not in data[:1024]:
        raise PDFValidationError("Le contenu du fichier n'est pas un PDF valide.")

    try:
        doc = pymupdf.open(stream=data, filetype='pdf')
    except Exception:
        raise PDFValidationError("Impossible de lire ce PDF (fichier corrompu ou invalide).")
    try:
        if doc.needs_pass or doc.is_encrypted:
            raise PDFValidationError("Les PDF protégés par mot de passe ne sont pas acceptés.")
        page_count = doc.page_count
    finally:
        doc.close()

    if page_count < 1:
        raise PDFValidationError("Le PDF ne contient aucune page.")
    if page_count > settings.PLANNER_MAX_PDF_PAGES:
        raise PDFValidationError(f"Trop de pages (maximum {settings.PLANNER_MAX_PDF_PAGES}).")

    return data, hashlib.sha256(data).hexdigest(), page_count


def render_page_to_png(pdf_bytes, page_number):
    """
    Rend la page `page_number` (commence à 1) en PNG.
    La résolution est réduite automatiquement si l'image dépasserait
    PLANNER_MAX_RENDER_PIXELS sur son plus grand côté (protection mémoire).
    """
    dpi = settings.PLANNER_RENDER_DPI
    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype='pdf')
    except Exception:
        raise PDFValidationError("Impossible de lire ce PDF.")
    try:
        if not 1 <= page_number <= doc.page_count:
            raise PDFValidationError(f"Page invalide : choisissez entre 1 et {doc.page_count}.")
        page = doc[page_number - 1]
        rect = page.rect
        if rect.width <= 0 or rect.height <= 0:
            raise PDFValidationError("La page sélectionnée est vide.")

        scale = dpi / 72.0
        longest = max(rect.width, rect.height) * scale
        if longest > settings.PLANNER_MAX_RENDER_PIXELS:
            scale *= settings.PLANNER_MAX_RENDER_PIXELS / longest
            dpi = max(1, int(round(scale * 72)))

        pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
        return RenderedPage(png_bytes=pix.tobytes('png'), width=pix.width, height=pix.height, dpi=dpi)
    except PDFValidationError:
        raise
    except Exception:
        raise PDFValidationError("Échec du rendu de la page sélectionnée.")
    finally:
        doc.close()
