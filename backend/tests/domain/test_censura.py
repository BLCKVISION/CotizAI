from evaluador.observabilidad.censura import censurar, censurar_cabeceras


def test_censura_campos_sensibles_anidados_y_correos():
    r = censurar(
        {"contrasena": "x", "datos": {"token": "t", "correo": "ana@org.com", "ok": 1}, "n": [{"password": "p"}]}
    )
    assert r == {
        "contrasena": "***",
        "datos": {"token": "***", "correo": "a***@org.com", "ok": 1},
        "n": [{"password": "***"}],
    }


def test_censura_bearer_en_texto_y_cabeceras():
    assert "abc123" not in censurar("fallo con Bearer abc123 en la llamada")
    assert censurar_cabeceras({"authorization": "Bearer zzz", "user-agent": "x"})["authorization"] == "***"
