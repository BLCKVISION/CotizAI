"""Preprocesado de fotos de presupuestos para mejorar la lectura: orientación, escala, contraste y nitidez.

No «arregla» el contenido: solo hace más legible lo que ya está en la imagen. Las entradas corruptas o desmesuradas
se rechazan como archivo inválido, sin detalle interno.
"""

from __future__ import annotations

import io

from PIL import Image, ImageFilter, ImageOps

from evaluador.domain.errors import InvalidData

MIN_LONG_SIDE = 1600  # por debajo, se amplía: las cifras pequeñas de una foto reducida se leen mal
MAX_PIXELS = 30_000_000  # una foto de móvil ronda 12-24 MP; el resto es memoria (varias copias por petición)


def _flatten(img: Image.Image) -> Image.Image:
    """A RGB, con la transparencia aplanada sobre blanco (un fondo negro ocultaría el texto)."""
    if img.mode in ("RGBA", "LA", "P", "PA") or "transparency" in img.info:
        rgba = img.convert("RGBA")
        base = Image.new("RGB", rgba.size, "white")
        base.paste(rgba, mask=rgba.getchannel("A"))
        return base
    return img.convert("RGB")


def enhance(data: bytes) -> bytes:
    """Devuelve un PNG RGB con la imagen orientada, ampliada si es pequeña, con contraste y nitidez."""
    try:
        img: Image.Image = Image.open(io.BytesIO(data))
        if img.width * img.height > MAX_PIXELS:
            raise InvalidData("La imagen es demasiado grande.")
        img = _flatten(ImageOps.exif_transpose(img))
        long_side = max(img.size)
        if long_side < MIN_LONG_SIDE:
            factor = MIN_LONG_SIDE / long_side
            img = img.resize((round(img.width * factor), round(img.height * factor)), Image.Resampling.LANCZOS)
        img = ImageOps.autocontrast(img, cutoff=1).filter(ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3))
        out = io.BytesIO()
        img.save(out, format="PNG")
        return out.getvalue()
    except InvalidData:
        raise
    except Exception as exc:  # noqa: BLE001 - imagen corrupta o maliciosa: error de archivo, sin detalle interno
        raise InvalidData("No se pudo leer la imagen.") from exc
