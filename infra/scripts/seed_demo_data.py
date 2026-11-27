"""Loads four demo projects through the real API. Suppliers and figures are made up.

The in-memory backend forgets everything on restart, so run this again afterwards:
    backend/.venv/bin/python infra/scripts/seed_demo_data.py --lab-proposals PATH/TO/propuestas

It only creates input data (projects, files, suppliers, notes and stage changes), never evaluation results.
Projects that already exist (same name) are left untouched.
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from openpyxl import Workbook

ENV_FILE = Path(__file__).resolve().parents[2] / "backend" / ".env"

SUPPLIERS = [
    ("Mobiliarios Carabobo C.A.", "J-40112233-1", "Valencia", "ventas@carabobo.example"),
    ("Redes del Lago C.A.", "J-30998877-2", "Maracaibo", "0261-555-0142"),
    ("Energia Segura Caracas C.A.", "J-41555010-8", "Caracas", "0212-555-0188"),
    ("Suministros Avila C.A.", "J-29443321-5", "Caracas", "cotizaciones@avila.example"),
]

FURNITURE = [("Escritorio de 120 cm", 12), ("Silla ergonomica", 12), ("Archivador de 4 gavetas", 4)]
NETWORK = [("Switch gestionable de 24 puertos", 2), ("Punto de red certificado Cat6", 40), ("Gabinete de pared 12U", 1)]
POWER = [("UPS en linea de 3 kVA", 2), ("Banco de baterias", 2), ("Tablero de proteccion", 1)]

# Oldest first: the last one created is the newest and leads Home.
PROJECTS = [
    {
        "nombre": "Respaldo eléctrico de la sala de servidores", "ubicacion": "Caracas", "moneda": "VES", "presupuesto": 4200000,
        "requerimiento": "UPS en línea, banco de baterías y tablero de protección, con instalación y garantía de un año.",
        "items": POWER,
        "quotes": [("Energia_Segura_Caracas", [1150000, 480000, 260000]), ("Suministros_Avila", [1220000, 455000, 300000]),
                   ("Voltios_Centro", [1090000, 530000, 280000])],
        "stage": "adjudicado",
        "note": "Dato de demostración: el comité pidió confirmar el plazo de instalación antes de firmar.",
    },
    {
        "nombre": "Red de datos de la sede principal", "ubicacion": "Maracaibo", "moneda": "USD", "presupuesto": 6200,
        "requerimiento": "Cableado estructurado Cat6 para 40 puntos, dos switches gestionables y gabinete de pared.",
        "items": NETWORK,
        "quotes": [("Redes_del_Lago", [310, 62, 190]), ("Conectar_Zulia", [295, 68, 175]), ("Suministros_Avila", [340, 59, 210])],
        "stage": "en_revision_del_comite",
        "note": "Dato de demostración: pendiente comparar las condiciones de garantía.",
    },
    {
        "nombre": "Mobiliario para oficinas administrativas", "ubicacion": "Valencia", "moneda": "USD", "presupuesto": 8500,
        "requerimiento": "12 puestos de trabajo con escritorio y silla ergonómica, más 4 archivadores. Incluye armado.",
        "items": FURNITURE,
        "quotes": [("Mobiliarios_Carabobo", [185, 140, 160]), ("Oficinas_Modernas", [210, 128, 145])],
        "stage": "en_recepcion",
    },
    {
        "nombre": "Laboratorio de computación", "ubicacion": "Caracas", "moneda": "USD", "presupuesto": 12000,
        "requerimiento": "Dotación de un laboratorio con 10 equipos para estudiantes y 1 para el docente, con periféricos y protección eléctrica.",
        "items": [], "quotes": [], "stage": "en_recepcion",
    },
]
# Roles needed to move a project to each stage, in order.
STAGE_PATH = {
    "en_recepcion": [],
    "en_revision_del_comite": [("evaluador", "en_evaluacion"), ("evaluador", "en_revision_del_comite")],
    "adjudicado": [("evaluador", "en_evaluacion"), ("evaluador", "en_revision_del_comite"), ("aprobador", "adjudicado")],
}


def read_env() -> dict[str, str]:
    pairs = (line.split("=", 1) for line in ENV_FILE.read_text().splitlines() if "=" in line and not line.startswith("#"))
    return {key.strip(): value.strip().strip("\"'") for key, value in pairs}


class Api:
    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/") + "/api/v1"

    def call(self, method: str, path: str, token: str | None = None, body: object = None, raw: bytes | None = None):
        headers = {"Content-Type": "application/octet-stream" if raw else "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        data = raw if raw else json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.loads(response.read() or b"null")
        except urllib.error.HTTPError as error:
            sys.exit(f"{method} {path} -> {error.code}: {error.read().decode()[:300]}")

    def login(self, user: str, password: str) -> str:
        return self.call("POST", "/sesiones", body={"correo": user, "contrasena": password})["token_acceso"]


def quote_file(supplier: str, items: list[tuple[str, int]], prices: list[int]) -> bytes:
    book = Workbook()
    sheet = book.active
    sheet.title = "Cotizacion"
    sheet.append([f"Cotizacion de demostracion - {supplier.replace('_', ' ')} (proveedor ficticio)"])
    sheet.append(["Descripcion", "Cantidad", "Precio unitario", "Subtotal"])
    for (description, quantity), price in zip(items, prices, strict=True):
        sheet.append([description, quantity, price, quantity * price])
    sheet.append(["Total", "", "", sum(q * p for (_, q), p in zip(items, prices, strict=True))])
    sheet.append(["Condiciones: garantia de 12 meses. Instalacion incluida."])
    sheet.column_dimensions["A"].width = 44
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--lab-proposals", type=Path, help="Folder with the practice proposals for the computer lab")
    args = parser.parse_args()

    env = read_env()
    api = Api(args.api)
    owner = api.login(env["EVALUADOR_USUARIO_DEMO_CORREO"], env["EVALUADOR_USUARIO_DEMO_CLAVE"])
    roles = {role: api.login(f"{role}@demo.local", env["EVALUADOR_SEMILLA_CLAVE"]) for role in ("evaluador", "aprobador")}

    known_ids = {s["rif"] for s in api.call("GET", "/proveedores", owner)}
    for name, tax_id, location, contact in SUPPLIERS:
        if tax_id not in known_ids:
            api.call("POST", "/proveedores", owner, {"nombre": name, "rif": tax_id, "ubicacion": location, "contacto": contact})

    existing = {p["nombre"] for p in api.call("GET", "/proyectos", owner)}
    for spec in PROJECTS:
        if spec["nombre"] in existing:
            print(f"ya existe: {spec['nombre']}")
            continue
        project = api.call("POST", "/proyectos", owner, {
            "nombre": spec["nombre"], "requerimiento": spec["requerimiento"], "ubicacion": spec["ubicacion"],
            "moneda": spec["moneda"], "presupuesto_referencial": spec["presupuesto"],
        })
        files = [(f"{supplier}_demo.xlsx", quote_file(supplier, spec["items"], prices)) for supplier, prices in spec["quotes"]]
        if not spec["quotes"] and args.lab_proposals:
            files = [(f.name, f.read_bytes()) for f in sorted(args.lab_proposals.iterdir()) if f.is_file()]
        for name, content in files:
            api.call("POST", f"/proyectos/{project['id']}/propuestas?archivo={urllib.parse.quote(name)}", owner, raw=content)
        for role, destination in STAGE_PATH[spec["stage"]]:
            api.call("POST", f"/proyectos/{project['id']}/transiciones", roles[role], {"destino": destination, "motivo": None})
        if "note" in spec:
            api.call("POST", f"/proyectos/{project['id']}/notas", roles["evaluador"], {"texto": spec["note"]})
        print(f"creado: {spec['nombre']} · {len(files)} propuestas · {spec['stage']}")


if __name__ == "__main__":
    main()
