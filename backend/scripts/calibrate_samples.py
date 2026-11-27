"""Validate domain rules + ranking calibration against muestras/resultado_esperado.json."""

from __future__ import annotations

import json
import sys
from decimal import Decimal
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "src"))

from evaluador.domain.costo import calcular_costo_real
from evaluador.domain.evaluacion import Hallazgo, Veredicto
from evaluador.domain.extraccion import ExtraccionPropuesta
from evaluador.domain.puntaje import RubricaPuntuada, puntaje_total
from evaluador.domain.ranking import Candidata, ParametrosDeRanking, ordenar_ranking
from evaluador.domain.reglas.abusivo import validar_abuso
from evaluador.domain.reglas.alcance import validar_alcance_fijo
from evaluador.domain.reglas.aritmetica import validar_aritmetica
from evaluador.domain.reglas.calidad import validar_calidad
from evaluador.domain.reglas.capacidad import validar_capacidad
from evaluador.domain.reglas.compatibilidad import validar_compatibilidad
from evaluador.domain.reglas.manipulacion import detectar_manipulacion

MUESTRAS = BACKEND.parent / "muestras"


def hallazgos_de(ext: ExtraccionPropuesta) -> list[Hallazgo]:
    return [
        *validar_aritmetica(ext),
        *validar_alcance_fijo(ext),
        *validar_compatibilidad(ext),
        *validar_capacidad(ext),
        *validar_calidad(ext),
        *validar_abuso(ext),
        *detectar_manipulacion("", ext.sospechas_de_manipulacion),
    ]


def main() -> int:
    esperado = json.loads((MUESTRAS / "resultado_esperado.json").read_text(encoding="utf-8"))
    candidatas: list[Candidata] = []
    ok = True
    for nombre, meta in sorted(esperado["propuestas"].items()):
        crudo = json.loads((MUESTRAS / "extracciones" / f"{nombre}.json").read_text(encoding="utf-8"))
        ext = ExtraccionPropuesta.model_validate(crudo["extraccion"])
        rubrica = RubricaPuntuada.model_validate(crudo["rubrica"]) if crudo.get("rubrica") else None
        hallazgos = hallazgos_de(ext)
        veredicto = (
            Veredicto.DESCARTADA
            if any(h.descarta for h in hallazgos)
            else (Veredicto.PENDIENTE_DE_REVISION if hallazgos else Veredicto.VALIDA)
        )
        codigos = sorted({h.codigo.value for h in hallazgos})
        match_v = veredicto.value == meta["veredicto"]
        match_c = set(codigos) == set(meta["codigos"])
        ok = ok and match_v and match_c
        puntaje = puntaje_total(rubrica) if veredicto is Veredicto.VALIDA and rubrica else None
        costo = calcular_costo_real(ext).total
        candidatas.append(Candidata(nombre, veredicto, puntaje, costo))
        print(f"{nombre:14} -> {veredicto.value:22} codigos={codigos} esperado={meta['codigos']}")

    ranking = list(ordenar_ranking(candidatas, ParametrosDeRanking(delta=Decimal(esperado["delta"]))))
    print("\nRanking obtenido:", ranking)
    print("Ranking esperado:", esperado["ranking"])
    print("Coincide:", ranking == esperado["ranking"] and ok)
    return 0 if (ranking == esperado["ranking"] and ok) else 1


if __name__ == "__main__":
    raise SystemExit(main())
