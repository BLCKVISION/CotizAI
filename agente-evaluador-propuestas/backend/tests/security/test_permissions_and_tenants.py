"""Verificación de permisos por rol y aislamiento entre organizaciones (secciones 3 y 4.1 de la arquitectura).

Se auto-adapta: descubre TODAS las rutas montadas en la app y, para cada una, comprueba
  1. que sin sesión responde 401;
  2. que con cada rol responde 403 si y solo si el rol NO tiene el permiso que la ruta exige;
  3. que una organización no puede ver, listar ni modificar datos de otra (404, nunca 403, para no revelar ids).
Cuando se monten routers nuevos (evaluaciones, propuestas, reportes…) entran solos en las comprobaciones 1 y 2.

Ejecutar: cd backend && .venv/bin/python -m pytest tests/security -q
"""

from __future__ import annotations

import importlib
import pkgutil
import re
from collections.abc import Iterator

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http import routers as routers_pkg
from evaluador.adapters.inbound.http.app import create_app
from evaluador.composition.container import build_container
from evaluador.composition.settings import Settings
from evaluador.domain.identity import PERMISSIONS_BY_ROLE, Permission, Role, Tenant, User

KEY = "Clave-Segura-123!"
ORGS = ("alfa", "beta")
SOME_UUID = "00000000-0000-4000-8000-000000000000"
PUBLIC = {("POST", "/api/v1/sessions"), ("GET", "/api/v1/health")}  # únicas rutas sin sesión

# Especificación INDEPENDIENTE del código (sección 4.1 del documento): si alguien amplía privilegios por error,
# esta tabla lo delata aunque las rutas sigan «funcionando».
SPEC: dict[str, set[str]] = {
    "loader": {"create_project", "load_documents", "start_evaluation", "view_state"},
    "evaluator": {"start_evaluation", "view_state", "view_results", "annotate_review", "register_rate"},
    "approver": {"view_state", "view_results", "annotate_review", "award_or_close"},
    "auditor": {"view_state", "view_results", "view_audit"},
}


@pytest.fixture(scope="module")
def container():
    c = build_container()
    hashed = c.hasher.hash(KEY)
    for org in ORGS:
        c.tenants.save(Tenant(id=f"t-{org}", code=org, name=org.upper()))
        for role in Role:
            c.users.save(
                User(
                    id=f"{org}-{role}",
                    tenant_id=f"t-{org}",
                    email=f"{role}@{org}.test",
                    password_hash=hashed,
                    role=role,
                )
            )
    return c


@pytest.fixture(scope="module")
def client(container) -> Iterator[TestClient]:
    app = create_app(Settings(log_level="CRITICAL", login_limit_per_minute=10_000), container)
    # Un 500 por un router a medio cablear no debe ocultar el resultado de autorización: solo importa 401/403/404.
    with TestClient(app, raise_server_exceptions=False) as c:
        c.app_for_routes = app  # type: ignore[attr-defined]
        yield c


@pytest.fixture(scope="module")
def tokens(client) -> dict[tuple[str, str], str]:
    out: dict[tuple[str, str], str] = {}
    for org in ORGS:
        for role in Role:
            r = client.post("/api/v1/sessions", json={"email": f"{role}@{org}.test", "password": KEY})
            assert r.status_code == 201, r.text
            out[(org, str(role))] = r.json()["access_token"]
    return out


def auth(tokens, org: str, role: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens[(org, role)]}"}


# ---------- descubrimiento de rutas ----------
def _required_permission(route: APIRoute) -> Permission | None:
    """Lee el permiso del guard `require(...)` (su cierre guarda `permission`) recorriendo las dependencias."""
    stack = list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        closure = getattr(dep.call, "__closure__", None) or ()
        for cell in closure:
            if isinstance(cell.cell_contents, Permission):
                return cell.cell_contents
        stack.extend(dep.dependencies)
    return None


def _router_modules():
    """Todos los routers del paquete; solo cuentan los que la app tiene montados (se comprueba con OpenAPI)."""
    for info in pkgutil.iter_modules(routers_pkg.__path__):
        module = importlib.import_module(f"{routers_pkg.__name__}.{info.name}")
        if hasattr(module, "router"):
            yield module.router


def _routes(app) -> list[tuple[str, str, Permission | None]]:
    # Los routers incluidos ya no aparecen como rutas planas en `app.routes`: se usa el esquema OpenAPI (API pública)
    # para saber QUÉ está montado y el `APIRoute` del router para saber QUÉ PERMISO exige.
    mounted = {(m.upper(), path) for path, ops in app.openapi()["paths"].items() for m in ops}
    permission_of: dict[tuple[str, str], Permission | None] = {}
    for router in _router_modules():
        for r in router.routes:
            if isinstance(r, APIRoute):
                for method in r.methods - {"HEAD", "OPTIONS"}:
                    permission_of[(method, f"/api/v1{r.path}")] = _required_permission(r)
    # Cada ruta montada cuenta una vez; las que no vienen de un router del paquete (p. ej. /health) van sin permiso.
    return [
        (method, re.sub(r"\{[^}]+\}", SOME_UUID, template), permission_of.get((method, template)))
        for method, template in sorted(mounted)
        if template.startswith("/api/v1")
    ]


@pytest.fixture(scope="module")
def routes(client):
    return _routes(client.app_for_routes)


def _call(client, method: str, path: str, headers: dict[str, str] | None = None):
    kwargs: dict = {"headers": headers or {}}
    if method in {"POST", "PUT", "PATCH"}:
        kwargs["json"] = {}
    return client.request(method, path, **kwargs)


# ---------- 0. la especificación coincide con el código ----------
def test_role_matrix_in_code_matches_the_specification():
    code = {str(role): {str(p) for p in perms} for role, perms in PERMISSIONS_BY_ROLE.items()}
    assert code == SPEC, "Los permisos por rol del código ya no coinciden con la sección 4.1 de la arquitectura."


def test_at_least_the_core_routes_are_discovered(routes):
    paths = {(m, p) for m, p, _ in routes}
    assert ("GET", "/api/v1/projects") in paths and ("POST", "/api/v1/projects") in paths


# ---------- 1. sin sesión: 401 en todo lo que no es público ----------
def test_every_non_public_route_rejects_requests_without_a_session(client, routes):
    leaks = []
    for method, path, _ in routes:
        if (method, path) in PUBLIC:
            continue
        status = _call(client, method, path).status_code
        if status != 401:
            leaks.append(f"{method} {path} -> {status}")
    assert not leaks, "Rutas accesibles sin sesión:\n" + "\n".join(leaks)


def test_a_garbage_token_is_rejected_everywhere(client, routes):
    bad = {"Authorization": "Bearer no-es-un-token"}
    leaks = [
        f"{m} {p}"
        for m, p, _ in routes
        if (m, p) not in PUBLIC and p != "/api/v1/sessions/current" and _call(client, m, p, bad).status_code != 401
    ]
    assert not leaks, "Aceptan un token falso:\n" + "\n".join(leaks)


# ---------- 2. matriz de roles: 403 exactamente cuando falta el permiso ----------
def test_every_guarded_route_returns_403_exactly_for_roles_without_the_permission(client, routes, tokens):
    wrong = []
    guarded = [(m, p, perm) for m, p, perm in routes if perm is not None]
    assert guarded, "No se encontró ninguna ruta protegida con require(...)."
    for method, path, perm in guarded:
        for role in Role:
            status = _call(client, method, path, auth(tokens, "alfa", str(role))).status_code
            allowed = perm in PERMISSIONS_BY_ROLE[role]
            if allowed and status in (401, 403):
                wrong.append(f"{role} DEBERÍA poder {method} {path} ({perm}) y recibió {status}")
            if not allowed and status != 403:
                wrong.append(f"{role} NO debería poder {method} {path} ({perm}) y recibió {status}")
    assert not wrong, "\n".join(wrong)


@pytest.mark.parametrize(
    ("role", "method", "path"),
    [
        ("auditor", "POST", "/api/v1/projects"),  # el auditor no crea proyectos
        ("approver", "POST", "/api/v1/projects"),
        ("evaluator", "POST", "/api/v1/projects"),
    ],
)
def test_only_loader_can_create_projects(client, tokens, role, method, path):
    body = {"name": "Proyecto X", "requirement": "r", "location": "l", "reference_budget": None}
    assert client.request(method, path, json=body, headers=auth(tokens, "alfa", role)).status_code == 403


# ---------- 3. aislamiento entre organizaciones ----------
@pytest.fixture(scope="module")
def alfa_project(client, tokens) -> str:
    body = {"name": "Laboratorio alfa", "requirement": "11 equipos", "location": "Caracas", "reference_budget": None}
    r = client.post("/api/v1/projects", json=body, headers=auth(tokens, "alfa", "loader"))
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.mark.parametrize("role", [str(r) for r in Role])
def test_another_organization_gets_404_not_403_for_a_project_it_does_not_own(client, tokens, alfa_project, role):
    r = client.get(f"/api/v1/projects/{alfa_project}", headers=auth(tokens, "beta", role))
    assert r.status_code == 404, (
        f"{role} de beta recibió {r.status_code}: un 403 revelaría que el id existe en otra org."
    )


def test_the_owner_can_read_its_own_project(client, tokens, alfa_project):
    assert client.get(f"/api/v1/projects/{alfa_project}", headers=auth(tokens, "alfa", "evaluator")).status_code == 200


def test_listing_never_shows_projects_of_another_organization(client, tokens, alfa_project):
    ids = [p["id"] for p in client.get("/api/v1/projects", headers=auth(tokens, "beta", "evaluator")).json()]
    assert alfa_project not in ids


def test_another_organization_cannot_transition_a_foreign_project(client, tokens, alfa_project):
    r = client.post(
        f"/api/v1/projects/{alfa_project}/transitions",
        json={"target": "evaluating"},
        headers=auth(tokens, "beta", "evaluator"),  # tiene el permiso del destino: solo falla por ser ajeno
    )
    assert r.status_code == 404


def test_foreign_project_stays_unchanged_after_the_attempt(client, tokens, alfa_project):
    r = client.get(f"/api/v1/projects/{alfa_project}", headers=auth(tokens, "alfa", "loader"))
    assert r.json()["state"] == "receiving"


# ---------- el cliente nunca decide organización, rol ni usuario ----------
@pytest.mark.parametrize("field", ["tenant_id", "organization_id", "organization", "role", "user_id", "created_by"])
def test_inputs_reject_tenant_or_role_fields(client, tokens, field):
    body = {"name": "Proyecto X", "requirement": "r", "location": "l", "reference_budget": None, field: "t-beta"}
    r = client.post("/api/v1/projects", json=body, headers=auth(tokens, "alfa", "loader"))
    assert r.status_code == 422, f"El campo `{field}` del cliente no debe aceptarse (recibió {r.status_code})."


def test_login_cannot_pick_the_organization(client):
    r = client.post("/api/v1/sessions", json={"email": "loader@alfa.test", "password": KEY, "organization": "beta"})
    assert r.status_code == 422


def test_a_session_is_bound_to_its_own_organization(client, tokens):
    me = client.get("/api/v1/users/current", headers=auth(tokens, "beta", "evaluator")).json()
    assert me["organization_id"] == "t-beta" and me["email"] == "evaluator@beta.test"


# ---------- errores limpios: sin trazas ni datos internos ----------
def test_authorization_errors_are_clean_json_with_track_id(client, tokens):
    r = client.post("/api/v1/projects", json={}, headers=auth(tokens, "alfa", "auditor"))
    body = r.json()
    assert r.status_code == 403 and set(body) >= {"code", "message", "track_id"}
    assert "Traceback" not in r.text and 'File "' not in r.text
