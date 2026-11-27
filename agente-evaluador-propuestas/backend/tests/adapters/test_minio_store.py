"""Almacén de archivos sobre MinIO/S3: cifrado en el cliente (AES-256-GCM) ANTES de subir.

Lo subido nunca es legible, el nombre del objeto no revela tenant ni clave, y alterar o mover un objeto se detecta.
La prueba de integración usa el MinIO real si hay credenciales (ver `test_against_real_minio`); si no, se salta.
"""

from __future__ import annotations

import os
import uuid

import pytest
from minio.error import S3Error

from evaluador.adapters.outbound.storage.minio_store import MinioFileStore
from evaluador.domain.errors import InvalidData, NotFound, ServiceUnavailable

KEY = bytes(range(32))
SECRET = b"%PDF-1.7 propuesta confidencial de Alfa C.A. total 10450,00"


def s3_error(code: str) -> S3Error:
    return S3Error(None, code, code, "/x", "rid", "hid")  # type: ignore[arg-type]


class FakeResponse:
    def __init__(self, data: bytes) -> None:
        self._data, self.closed, self.released = data, False, False

    def read(self) -> bytes:
        return self._data

    def close(self) -> None:
        self.closed = True

    def release_conn(self) -> None:
        self.released = True


class FakeS3:
    """Subconjunto de `minio.Minio` que usa el adaptador."""

    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.fail_with: Exception | None = None
        self.responses: list[FakeResponse] = []

    def _maybe_fail(self) -> None:
        if self.fail_with:
            raise self.fail_with

    def put_object(self, bucket_name, object_name, data, length, **_):
        self._maybe_fail()
        payload = data.read()
        assert len(payload) == length
        self.objects[(bucket_name, object_name)] = payload

    def get_object(self, bucket_name, object_name, **_):
        self._maybe_fail()
        if (bucket_name, object_name) not in self.objects:
            raise s3_error("NoSuchKey")
        r = FakeResponse(self.objects[(bucket_name, object_name)])
        self.responses.append(r)
        return r

    def remove_object(self, bucket_name, object_name):
        self._maybe_fail()
        self.objects.pop((bucket_name, object_name), None)


@pytest.fixture
def s3() -> FakeS3:
    return FakeS3()


@pytest.fixture
def store(s3) -> MinioFileStore:
    return MinioFileStore(s3, "proposals", KEY)


def test_round_trip(store):
    store.put("t-alfa", "k1", SECRET)
    assert store.get("t-alfa", "k1") == SECRET


def test_what_is_uploaded_is_never_readable(store, s3):
    store.put("t-alfa", "k1", SECRET)
    (blob,) = s3.objects.values()
    assert SECRET not in blob and b"confidencial" not in blob and b"%PDF" not in blob


def test_object_name_does_not_reveal_tenant_or_key(store, s3):
    store.put("t-alfa", "clave-secreta-123", SECRET)
    ((_, name),) = s3.objects
    assert "alfa" not in name and "clave-secreta" not in name and ".." not in name and not name.startswith("/")


def test_object_names_are_stable_per_tenant_and_key_but_differ_across_tenants(store, s3):
    store.put("t-alfa", "k", b"a")
    store.put("t-beta", "k", b"b")
    assert len(s3.objects) == 2  # misma clave, distinto tenant: objetos distintos
    store.put("t-alfa", "k", b"a2")  # reescribir la misma clave sobrescribe, no duplica
    assert len(s3.objects) == 2 and store.get("t-alfa", "k") == b"a2"


def test_another_tenant_cannot_read_the_file(store):
    store.put("t-alfa", "k", SECRET)
    with pytest.raises(NotFound):
        store.get("t-beta", "k")


def test_a_copied_object_does_not_decrypt_under_another_tenant_or_key(store, s3):
    store.put("t-alfa", "k", SECRET)
    ((bucket, name), blob) = next(iter(s3.objects.items()))
    store.put("t-beta", "otro", b"x")
    ((_, beta_name),) = [o for o in s3.objects if o[1] != name]
    s3.objects[(bucket, beta_name)] = blob  # un atacante con acceso al bucket copia el objeto de alfa sobre el de beta
    with pytest.raises(InvalidData):
        store.get("t-beta", "otro")


def test_tampering_is_detected(store, s3):
    store.put("t-alfa", "k", SECRET)
    ((bucket, name), blob) = next(iter(s3.objects.items()))
    s3.objects[(bucket, name)] = blob[:-1] + bytes([blob[-1] ^ 1])
    with pytest.raises(InvalidData):
        store.get("t-alfa", "k")


def test_truncated_object_is_rejected(store, s3):
    store.put("t-alfa", "k", SECRET)
    ((bucket, name), _) = next(iter(s3.objects.items()))
    s3.objects[(bucket, name)] = b"corto"
    with pytest.raises(InvalidData):
        store.get("t-alfa", "k")


def test_missing_object_is_not_found(store):
    with pytest.raises(NotFound):
        store.get("t-alfa", "no-existe")


def test_delete_removes_the_object_and_is_idempotent(store, s3):
    store.put("t-alfa", "k", SECRET)
    store.delete("t-alfa", "k")
    store.delete("t-alfa", "k")
    assert not s3.objects
    with pytest.raises(NotFound):
        store.get("t-alfa", "k")


def test_connection_is_always_released(store, s3):
    store.put("t-alfa", "k", SECRET)
    store.get("t-alfa", "k")
    assert s3.responses and all(r.closed and r.released for r in s3.responses)


@pytest.mark.parametrize("op", ["put", "get", "delete"])
def test_an_outage_is_a_service_error_without_internal_detail(store, s3, op):
    s3.fail_with = ConnectionError("minio:9000 refused user=cotizai_app secret=abc123")
    with pytest.raises(ServiceUnavailable) as exc:
        {
            "put": lambda: store.put("t", "k", b"x"),
            "get": lambda: store.get("t", "k"),
            "delete": lambda: store.delete("t", "k"),
        }[op]()
    assert "abc123" not in str(exc.value) and "minio:9000" not in str(exc.value)


def test_s3_access_denied_is_a_service_error(store, s3):
    s3.fail_with = s3_error("AccessDenied")
    with pytest.raises(ServiceUnavailable):
        store.put("t", "k", b"x")


def test_rejects_a_wrong_sized_key(s3):
    with pytest.raises(InvalidData):
        MinioFileStore(s3, "proposals", b"corta")


def test_empty_bucket_name_is_rejected(s3):
    with pytest.raises(InvalidData):
        MinioFileStore(s3, "  ", KEY)


# ---------- integración con el MinIO real (opcional) ----------
REQUIRED = ("MINIO_TEST_ENDPOINT", "MINIO_TEST_USER", "MINIO_TEST_PASSWORD", "MINIO_TEST_BUCKET")


@pytest.mark.skipif(not all(os.environ.get(v) for v in REQUIRED), reason="sin MINIO_TEST_* en el entorno")
def test_against_real_minio():
    from minio import Minio

    client = Minio(
        os.environ["MINIO_TEST_ENDPOINT"],
        access_key=os.environ["MINIO_TEST_USER"],
        secret_key=os.environ["MINIO_TEST_PASSWORD"],
        secure=False,
    )
    bucket = os.environ["MINIO_TEST_BUCKET"]
    real = MinioFileStore(client, bucket, KEY)
    tenant, key = f"t-{uuid.uuid4()}", str(uuid.uuid4())
    try:
        real.put(tenant, key, SECRET)
        assert real.get(tenant, key) == SECRET
        with pytest.raises(NotFound):
            real.get("t-otro", key)
        # el objeto guardado en MinIO no es legible
        names = [o.object_name for o in client.list_objects(bucket, recursive=True)]
        raw = b"".join(client.get_object(bucket, n).read() for n in names[:50])
        assert SECRET not in raw
    finally:
        real.delete(tenant, key)
    with pytest.raises(NotFound):
        real.get(tenant, key)
