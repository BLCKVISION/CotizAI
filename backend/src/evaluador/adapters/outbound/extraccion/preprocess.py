"""Prepares photos of quotes for reading: orientation, scale, contrast and sharpness.

It does not "fix" the content: it only makes what is already in the image easier to read.
"""

from __future__ import annotations

import io

from PIL import Image, ImageFilter, ImageOps

from evaluador.domain.errores import DatoInvalido

MIN_LONG_SIDE = 1600  # smaller images are enlarged: small figures in a reduced photo are misread
MAX_LONG_SIDE = 3200  # larger ones are reduced: vision providers reject very large uploads
MAX_PIXELS = 30_000_000  # phone photos are 12-24 MP; beyond this it is only memory use


def _flatten(image: Image.Image) -> Image.Image:
    """To RGB, with transparency flattened onto white (a black background would hide the text)."""
    if image.mode in ("RGBA", "LA", "P", "PA") or "transparency" in image.info:
        rgba = image.convert("RGBA")
        base = Image.new("RGB", rgba.size, "white")
        base.paste(rgba, mask=rgba.getchannel("A"))
        return base
    return image.convert("RGB")


def enhance(data: bytes) -> bytes:
    """Returns an upright RGB PNG within the size limits, with more contrast and sharpness."""
    try:
        image: Image.Image = Image.open(io.BytesIO(data))
        if image.width * image.height > MAX_PIXELS:
            raise DatoInvalido("La imagen es demasiado grande.")
        image = _flatten(ImageOps.exif_transpose(image))
        long_side = max(image.size)
        target = min(max(long_side, MIN_LONG_SIDE), MAX_LONG_SIDE)
        if target != long_side:
            factor = target / long_side
            size = (max(1, round(image.width * factor)), max(1, round(image.height * factor)))
            image = image.resize(size, Image.Resampling.LANCZOS)
        image = ImageOps.autocontrast(image, cutoff=1).filter(
            ImageFilter.UnsharpMask(radius=2, percent=150, threshold=3)
        )
        out = io.BytesIO()
        image.save(out, format="PNG")
        return out.getvalue()
    except DatoInvalido:
        raise
    except Exception as exc:  # noqa: BLE001 - corrupt or malicious image: invalid file, no internal detail
        raise DatoInvalido("No se pudo leer la imagen.") from exc
