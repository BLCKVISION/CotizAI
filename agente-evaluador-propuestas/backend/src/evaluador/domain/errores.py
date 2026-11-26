"""Errores de dominio. Los adaptadores los traducen a su protocolo (HTTP, CLI)."""


class ErrorDeDominio(Exception):
    codigo = "error_de_dominio"


class CredencialesInvalidas(ErrorDeDominio):
    """Mensaje único para usuario inexistente, contraseña errónea, cuenta inactiva o bloqueada."""

    codigo = "credenciales_invalidas"


class SesionInvalida(ErrorDeDominio):
    codigo = "sesion_invalida"


class SinPermiso(ErrorDeDominio):
    codigo = "sin_permiso"


class NoEncontrado(ErrorDeDominio):
    codigo = "no_encontrado"


class TransicionInvalida(ErrorDeDominio):
    codigo = "transicion_invalida"


class DatoInvalido(ErrorDeDominio):
    codigo = "dato_invalido"
