"""Errores de dominio. Los adaptadores los traducen a su protocolo (HTTP, CLI)."""


class DomainError(Exception):
    code = "domain_error"


class InvalidCredentials(DomainError):
    """Mensaje único para usuario inexistente, contraseña errónea, cuenta inactiva o bloqueada."""

    code = "invalid_credentials"


class InvalidSession(DomainError):
    code = "invalid_session"


class PermissionDenied(DomainError):
    code = "permission_denied"


class NotFound(DomainError):
    code = "not_found"


class InvalidTransition(DomainError):
    code = "invalid_transition"


class InvalidData(DomainError):
    code = "invalid_data"


class RateUnavailable(DomainError):
    """No hay tasa vigente para comparar monedas: se pide registrar una manualmente (con fuente y fecha)."""

    code = "rate_unavailable"


class ServiceUnavailable(DomainError):
    """Un servicio externo (modelo de IA) no pudo responder. El mensaje nunca incluye detalle del proveedor."""

    code = "service_unavailable"


class PayloadTooLarge(InvalidData):
    """El archivo o el cuerpo excede el máximo permitido."""

    code = "payload_too_large"
