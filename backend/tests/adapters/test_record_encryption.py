"""Database records are encrypted with AES-256-GCM. The PostgreSQL test runs when a test database is given."""

from __future__ import annotations

import base64
import os
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

import pytest
from cryptography.exceptions import InvalidTag

from evaluador.adapters.outbound.persistence.record_cipher import RecordCipher

KEY = base64.b64encode(bytes(range(32))).decode()
DATABASE = os.environ.get("TEST_DATABASE_URL")


@dataclass(frozen=True)
class Note:
    id: str
    tenant_id: str
    creado: datetime
    text: str


def test_a_sealed_record_hides_its_content_and_is_bound_to_its_row():
    cipher = RecordCipher(KEY)
    sealed = cipher.seal('{"rif": "J-12345678-9"}', "proveedores", "t1", "r1")
    assert "J-12345678-9" not in sealed and cipher.is_sealed(sealed)
    assert cipher.open(sealed, "proveedores", "t1", "r1") == '{"rif": "J-12345678-9"}'
    for context in (("proveedores", "t2", "r1"), ("proveedores", "t1", "r2"), ("notas", "t1", "r1")):
        with pytest.raises(InvalidTag):
            cipher.open(sealed, *context)


def test_records_from_before_encryption_are_still_readable():
    assert RecordCipher(KEY).open('{"id": "1"}', "notas", "t", "1") == '{"id": "1"}'


def test_a_short_key_is_rejected():
    with pytest.raises(ValueError, match="32 bytes"):
        RecordCipher(base64.b64encode(b"short").decode())


@pytest.mark.skipif(not DATABASE, reason="TEST_DATABASE_URL is not set")
def test_existing_rows_are_encrypted_once_and_read_back():
    import psycopg

    from evaluador.adapters.outbound.persistence.coleccion_postgres import (
        ColeccionPostgres,
        encrypt_plain_records,
        preparar_esquema,
    )

    preparar_esquema(DATABASE)
    kind, cipher = f"test_{uuid.uuid4().hex}", RecordCipher(KEY)
    ColeccionPostgres(DATABASE, kind, Note).guardar(Note("a", "t", datetime.now(UTC), "dato confidencial"))
    assert encrypt_plain_records(DATABASE, cipher) >= 1 and encrypt_plain_records(DATABASE, cipher) == 0
    notes = ColeccionPostgres(DATABASE, kind, Note, cipher)
    notes.guardar(Note("b", "t", datetime.now(UTC), "otro secreto"))
    assert {n.text for n in notes.listar("t")} == {"dato confidencial", "otro secreto"}
    assert notes.por_id("t", "a").text == "dato confidencial"
    with psycopg.connect(DATABASE) as c:
        stored = " ".join(r[0] for r in c.execute("SELECT datos::text FROM registros WHERE tipo = %s", (kind,)))
        c.execute("DELETE FROM registros WHERE tipo = %s", (kind,))
    assert "secreto" not in stored and "confidencial" not in stored
