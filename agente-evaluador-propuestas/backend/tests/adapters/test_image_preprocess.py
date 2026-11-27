"""Preprocesado de fotos de presupuestos: orientación, escala, modo de color y rechazo de entradas hostiles."""

import io

import pytest
from PIL import Image

from evaluador.adapters.outbound.extraction.preprocess import enhance
from evaluador.domain.errors import InvalidData


def encode(img: Image.Image, fmt: str = "PNG", **kw) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format=fmt, **kw)
    return buf.getvalue()


def decode(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img.load()
    return img


def test_small_image_is_upscaled():
    out = decode(enhance(encode(Image.new("RGB", (400, 300), "white"))))
    assert max(out.size) >= 1600


def test_large_image_is_not_resized():
    out = decode(enhance(encode(Image.new("RGB", (2400, 1800), "white"))))
    assert out.size == (2400, 1800)


def test_exif_rotation_is_applied():
    exif = Image.Exif()
    exif[0x0112] = 6  # girar 90° para mostrar
    out = decode(enhance(encode(Image.new("RGB", (2000, 1000), "white"), "JPEG", exif=exif.tobytes())))
    assert out.height > out.width


@pytest.mark.parametrize("mode", ["RGBA", "P", "L"])
def test_other_modes_become_rgb(mode):
    out = decode(enhance(encode(Image.new(mode, (2000, 1000)))))
    assert out.mode == "RGB"


def test_garbage_bytes_raise_invalid_data():
    with pytest.raises(InvalidData):
        enhance(b"\x89PNG\r\n\x1a\nxxxx")


def test_pixel_bomb_is_rejected():
    with pytest.raises(InvalidData, match="demasiado grande"):
        enhance(encode(Image.new("1", (8000, 8000))))


def test_limit_is_thirty_megapixels():
    with pytest.raises(InvalidData, match="demasiado grande"):
        enhance(encode(Image.new("1", (6000, 6000))))  # 36 MP
