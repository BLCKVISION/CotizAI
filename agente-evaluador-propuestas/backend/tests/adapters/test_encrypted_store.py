import base64
import os
import stat

import pytest

from evaluador.adapters.outbound.storage.encrypted_store import EncryptedFileStore, load_key
from evaluador.domain.errors import InvalidData, NotFound

KEY = bytes(range(32))
SECRET = b"CONTENIDO CONFIDENCIAL de la propuesta 1.100,00"


@pytest.fixture
def store(tmp_path):
    return EncryptedFileStore(tmp_path / "files", KEY)


def _disk_files(root):
    return [p for p in root.rglob("*") if p.is_file()]


def test_roundtrip(store):
    store.put("t1", "k1", SECRET)
    assert store.get("t1", "k1") == SECRET


def test_file_on_disk_is_not_plaintext(store, tmp_path):
    store.put("t1", "k1", SECRET)
    (path,) = _disk_files(tmp_path / "files")
    raw = path.read_bytes()
    assert b"CONFIDENCIAL" not in raw and SECRET not in raw


def test_permissions_are_restrictive(store, tmp_path):
    store.put("t1", "k1", SECRET)
    (path,) = _disk_files(tmp_path / "files")
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert stat.S_IMODE((tmp_path / "files").stat().st_mode) == 0o700
    assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700


def test_same_plaintext_gives_different_ciphertext(store, tmp_path):
    store.put("t1", "a", SECRET)
    store.put("t1", "b", SECRET)
    a, b = (p.read_bytes() for p in _disk_files(tmp_path / "files"))
    assert a != b  # nonce aleatorio por archivo


def test_tampering_one_byte_is_detected(store, tmp_path):
    store.put("t1", "k1", SECRET)
    (path,) = _disk_files(tmp_path / "files")
    raw = bytearray(path.read_bytes())
    raw[-1] ^= 0x01
    path.write_bytes(bytes(raw))
    with pytest.raises(InvalidData):
        store.get("t1", "k1")


def test_truncated_file_is_detected(store, tmp_path):
    store.put("t1", "k1", SECRET)
    (path,) = _disk_files(tmp_path / "files")
    path.write_bytes(path.read_bytes()[:5])
    with pytest.raises(InvalidData):
        store.get("t1", "k1")


def test_other_tenant_cannot_read(store):
    store.put("t1", "k1", SECRET)
    with pytest.raises(NotFound):
        store.get("t2", "k1")


def test_copied_file_to_other_tenant_does_not_decrypt(store, tmp_path):
    store.put("t1", "k1", SECRET)
    (first,) = _disk_files(tmp_path / "files")
    store.put("t2", "k1", b"otro")
    (second,) = [p for p in _disk_files(tmp_path / "files") if p != first]
    second.write_bytes(first.read_bytes())  # el cifrado de t1 en la ruta de t2: el AAD no coincide
    with pytest.raises(InvalidData):
        store.get("t2", "k1")


def test_missing_key_is_not_found(store):
    with pytest.raises(NotFound):
        store.get("t1", "nope")


def test_delete(store):
    store.put("t1", "k1", SECRET)
    store.delete("t1", "k1")
    with pytest.raises(NotFound):
        store.get("t1", "k1")
    store.delete("t1", "k1")  # idempotente


@pytest.mark.parametrize("bad", ["../../etc/passwd", "..", "a/../../b", "/abs/path", "k\x00x", "x" * 5000])
def test_hostile_keys_do_not_escape_the_directory(store, tmp_path, bad):
    root = tmp_path / "files"
    store.put("t1", bad, SECRET)
    assert store.get("t1", bad) == SECRET
    for p in _disk_files(tmp_path):
        assert root in p.parents
    assert not (tmp_path / "etc").exists()


def test_hostile_tenant_does_not_escape_the_directory(store, tmp_path):
    store.put("../x", "k", SECRET)
    assert all((tmp_path / "files") in p.parents for p in _disk_files(tmp_path))


def test_overwrite_is_atomic_and_leaves_no_temp_files(store, tmp_path):
    store.put("t1", "k1", b"uno")
    store.put("t1", "k1", b"dos")
    assert store.get("t1", "k1") == b"dos"
    assert len(_disk_files(tmp_path / "files")) == 1


def test_wrong_key_cannot_read(store, tmp_path):
    store.put("t1", "k1", SECRET)
    other = EncryptedFileStore(tmp_path / "files", bytes(reversed(range(32))))
    with pytest.raises(InvalidData):
        other.get("t1", "k1")


@pytest.mark.parametrize("size", [0, 16, 31, 33, 64])
def test_wrong_key_length_is_rejected(tmp_path, size):
    with pytest.raises(InvalidData):
        EncryptedFileStore(tmp_path, os.urandom(size))


def test_load_key_accepts_base64_of_32_bytes():
    assert load_key(base64.b64encode(KEY).decode()) == KEY


@pytest.mark.parametrize(
    "bad", ["", "no-es-base64!!", base64.b64encode(b"corta").decode(), base64.b64encode(bytes(33)).decode()]
)
def test_load_key_rejects_invalid(bad):
    with pytest.raises(InvalidData):
        load_key(bad)


def test_error_messages_do_not_leak_content(store, tmp_path):
    store.put("t1", "k1", SECRET)
    (path,) = _disk_files(tmp_path / "files")
    raw = bytearray(path.read_bytes())
    raw[-1] ^= 1
    path.write_bytes(bytes(raw))
    with pytest.raises(InvalidData) as e:
        store.get("t1", "k1")
    assert "CONFIDENCIAL" not in str(e.value)
