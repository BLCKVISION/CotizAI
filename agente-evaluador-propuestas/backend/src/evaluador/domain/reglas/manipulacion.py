"""Detección determinista de instrucciones dirigidas a la IA dentro de la propuesta (datos no confiables)."""

from __future__ import annotations

import re

from evaluador.domain.evaluacion import CodigoHallazgo, Hallazgo, Origen, Severidad

_PATRONES = [
    r"\bignor[ae]\s+(todas?\s+)?(las\s+)?(instrucciones|reglas)\b",
    r"\bignore\s+(all\s+)?(previous|prior|above)\s+instructions\b",
    r"\b(eres|act[uú]a\s+como|you\s+are\s+now)\s+(un|una|el|la|a|an|the)\b",
    r"\b(califica|punt[uú]a|rate|score)\b\s+.{0,40}(m[aá]xim|perfect|10/10|\b100\b)",
    r"\bno\s+(descartes|descalifiques)\s+esta\s+propuesta\b",
    r"\b(system|sistema)\s*prompt\b",
    r"\b(aprueba|apruebe|aprobar)\s+(esta|la)\s+propuesta\b",
]
_REGEX = [re.compile(p, re.IGNORECASE) for p in _PATRONES]


def detectar_manipulacion(texto: str, sospechas_del_modelo: list[str]) -> list[Hallazgo]:
    de_regla = [m.group(0) for r in _REGEX for m in r.finditer(texto)]
    del_modelo = [s.strip() for s in sospechas_del_modelo if s.strip()]
    citas = {c: Origen.REGLA for c in de_regla} | {c: Origen.IA for c in del_modelo if c not in de_regla}
    return [
        Hallazgo(CodigoHallazgo.MANIPULACION, Severidad.CRITICA, True,
                 "Instrucción dirigida a la IA dentro de la propuesta.", cita[:200], origen)
        for cita, origen in citas.items()
    ]  # fmt: skip
