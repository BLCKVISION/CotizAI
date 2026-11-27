import pytest
from pydantic import ValidationError

from evaluador.domain.extraction import ImageTranscription


def test_defaults_keep_old_contract():
    t = ImageTranscription(text="a")
    assert t.markdown == "" and t.uncertain == [] and t.quality == "high" and t.unreadable is False


def test_extra_fields_are_ignored():
    assert ImageTranscription(text="a", nope=1).text == "a"  # type: ignore[call-arg]


def test_quality_rejects_other_values():
    with pytest.raises(ValidationError):
        ImageTranscription(quality="x")  # type: ignore[arg-type]
