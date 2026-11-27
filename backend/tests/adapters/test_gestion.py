import base64

from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http.aplicacion import crear_aplicacion
from evaluador.adapters.outbound.almacen.cifrado import AlmacenCifrado
from evaluador.adapters.outbound.memory.auditoria_log import cadena_integra
from evaluador.composition.configuracion import Configuracion
from evaluador.domain.extraccion import ExtraccionPropuesta, Linea, Monto, Totales
from evaluador.domain.reglas.alcance import validar_alcance_fijo
from evaluador.domain.reglas.aritmetica import validar_aritmetica
from tests.conftest import cabecera

NUEVO = {"nombre": "Laboratorio", "requerimiento": "11 equipos", "ubicacion": "Caracas", "moneda": "VES"}
PDF = b"%PDF-1.4 contenido secreto"


def preparar(contenedor, tmp_path):
    contenedor.gestion._almacen = AlmacenCifrado(str(tmp_path), base64.b64encode(bytes(32)).decode())
    cliente = TestClient(crear_aplicacion(Configuracion(nivel_de_log="CRITICAL"), contenedor))
    cab = cabecera(cliente)
    pid = cliente.post("/api/v1/proyectos", json=NUEVO, headers=cab).json()["id"]
    return cliente, cab, f"/api/v1/proyectos/{pid}/propuestas"


def test_carga_cifrada_descarga_y_aislamiento(contenedor, tmp_path):
    cliente, cab, url = preparar(contenedor, tmp_path)
    r = cliente.post(f"{url}?archivo=Propuesta_1.pdf", content=PDF, headers=cab)
    assert r.status_code == 201, r.text
    [en_disco] = list(tmp_path.rglob("*.bin"))
    assert b"secreto" not in en_disco.read_bytes()
    assert cliente.get(f"{url}/{r.json()['id']}/archivo", headers=cab).content == PDF
    assert cliente.get(url, headers=cabecera(cliente, "beta")).status_code == 404
    assert cliente.delete(f"{url}/{r.json()['id']}", headers=cab).status_code == 204
    assert not list(tmp_path.rglob("*.bin"))


def test_rechaza_archivos_invalidos_duplicados_y_sin_permiso(contenedor, tmp_path):
    cliente, cab, url = preparar(contenedor, tmp_path)
    assert cliente.post(f"{url}?archivo=a.exe", content=PDF, headers=cab).status_code == 422
    assert cliente.post(f"{url}?archivo=a.png", content=PDF, headers=cab).status_code == 422
    assert cliente.post(f"{url}?archivo=../a.pdf", content=PDF, headers=cab).status_code == 422
    assert cliente.post(f"{url}?archivo=a.pdf", content=PDF, headers=cab).status_code == 201
    assert cliente.post(f"{url}?archivo=b.pdf", content=PDF, headers=cab).status_code == 422
    auditor = cabecera(cliente, rol="auditor")
    assert cliente.post(f"{url}?archivo=c.pdf", content=PDF + b"x", headers=auditor).status_code == 403
    grande = b"%PDF-" + bytes(10 * 1024 * 1024)
    rejected = cliente.post(f"{url}?archivo=g.pdf", content=grande, headers=cab)
    assert rejected.status_code == 413 and "10 MB" in rejected.json()["mensaje"]
    exact = b"%PDF-" + bytes(10 * 1024 * 1024 - 5)  # exactly the limit is still accepted
    assert cliente.post(f"{url}?archivo=justo.pdf", content=exact, headers=cab).status_code == 201


def test_estadisticas_proveedores_y_auditoria_encadenada(contenedor, tmp_path):
    cliente, cab, _ = preparar(contenedor, tmp_path)
    prov = {"nombre": "Alfa CA", "rif": "J-12345678-9", "ubicacion": "Caracas", "contacto": "ventas"}
    assert cliente.post("/api/v1/proveedores", json=prov, headers=cab).status_code == 201
    assert cliente.post("/api/v1/proveedores", json=prov, headers=cab).status_code == 422
    e = cliente.get("/api/v1/estadisticas", headers=cab).json()
    assert (e["total_proyectos"], e["total_proveedores"], e["por_estado"]["en_recepcion"]) == (1, 1, 1)
    assert cliente.get("/api/v1/auditoria", headers=cab).status_code == 403
    a = cliente.get("/api/v1/auditoria", headers=cabecera(cliente, rol="auditor")).json()
    assert a["integra"] and a["total"] >= 2
    eventos = contenedor.gestion._eventos.listar("t-alfa")
    assert cadena_integra(eventos)
    assert not cadena_integra(eventos[1:] if eventos[0].secuencia == 1 else eventos[:-2] + eventos[-1:])


def test_nota_del_comite(contenedor, tmp_path):
    cliente, _, url = preparar(contenedor, tmp_path)
    base = url.removesuffix("/propuestas")
    ev = cabecera(cliente, rol="evaluador")
    assert cliente.post(f"{base}/notas", json={"texto": "Revisar garantía"}, headers=ev).status_code == 201
    assert cliente.get(f"{base}/notas", headers=ev).json()[0]["autor"] == "evaluador@alfa.test"
    assert any(x["accion"] == "nota_agregada" for x in cliente.get(f"{base}/historial", headers=ev).json())


def _m(v):
    return Monto(literal=v, valor=v)


def _linea(categoria):
    return Linea(descripcion=categoria, categoria=categoria, cantidad=_m("11"), precio_unitario=_m("100"),
                 total_linea=_m("1100"))


def test_total_falso_sin_subtotal_se_detecta():
    e = ExtraccionPropuesta(lineas=[_linea("monitor")], totales=Totales(total=_m("9999")))
    assert any(h.descarta for h in validar_aritmetica(e))
    bien = ExtraccionPropuesta(lineas=[_linea("monitor")], totales=Totales(total=_m("1276"), impuestos=[_m("176")]))
    assert not validar_aritmetica(bien)


def test_equipo_completo_va_a_revision_no_a_descarte():
    hallazgos = validar_alcance_fijo(ExtraccionPropuesta(lineas=[_linea("computadora completa")]))
    assert hallazgos and not any(h.descarta for h in hallazgos)
