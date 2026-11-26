"""Detección determinista de instrucciones dirigidas a la IA dentro de la propuesta (datos no confiables)."""

from __future__ import annotations

import re

from evaluador.domain.evaluacion import CodigoHallazgo, Hallazgo, Origen, Severidad

_PATRONES = [
    r"ignor[ae]\s+(todas?\s+)?(las\s+)?(instrucciones|reglas)",
    r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions",
    r"(eres|act[uú]a como|you are now)\s+",
    r"(califica|puntúa|puntua|rate|score)\s+.{0,40}(m[aá]xim|perfect|10/10|100)",
    r"no\s+(descartes|descalifiques)\s+esta\s+propuesta",
    r"(system|sistema)\s*prompt",
    r"(aprueba|apruebe|aprobar)\s+(esta|la)\s+propuesta",
]
_REGEX = [re.compile(p, re.IGNORECASE) for p in _PATRONES]


def detectar_manipulacion(texto: str, sospechas_del_modelo: list[str]) -> list[Hallazgo]:
    citas = [m.group(0) for r in _REGEX for m in r.finditer(texto)] + [s for s in sospechas_del_modelo if s.strip()]
    return [
        Hallazgo(CodigoHallazgo.MANIPULACION, Severidad.CRITICA, True,
                 "Instrucción dirigida a la IA dentro de la propuesta.", cita[:200], Origen.REGLA)
        for cita in dict.fromkeys(citas)
    ]  # fmt: skip
