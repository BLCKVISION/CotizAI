# Muestras propias (S-4)

Nueve cotizaciones **ficticias** para un laboratorio de 11 computadoras (gabinete, monitor, teclado, ratón y protector
por equipo), con su resultado esperado. Sirven para validar de punta a punta el lote y para calibrar pesos y δ.
Proveedores y RIF son inventados.

| Archivo | Formato | Esperado | Qué prueba |
|---|---|---|---|
| `Propuesta_101_Alfa_CA` | XLSX | válida · puntaje 90.10 · costo 10.230,00 | Fórmulas, comentario y una **hoja oculta inocua** (no debe dar falsos positivos). |
| `Propuesta_102_Beta_SA` | PDF | válida · 88.30 · 9.625,00 | A 1.80 puntos de Alfa (dentro de δ=3) y más barata: **equivalencia técnica**, va primero. |
| `Propuesta_103_Gama_CA` | XLSX | descartada · `ARITMETICA` | 11 × 640,00 = 7.040,00 pero el documento imprime 6.740,00. |
| `Propuesta_104_Delta_CA` | PDF | descartada · `ALCANCE` | Solo cotiza computadoras y monitores. |
| `Propuesta_105_Epsilon_SA` | PDF | descartada · `MANIPULACION` | Instrucciones a la IA en texto de **1 pt** y en **texto blanco**. |
| `Propuesta_106_Zeta_CA` | XLSX | descartada · `MANIPULACION` | Instrucción a la IA en una **fila oculta**. |
| `Propuesta_107_Eta_SA` | XLSX | válida · 82.20 · 9.991,00 | Flete (300) e instalación (440) fuera de las líneas: **se suman, no descartan**. |
| `Propuesta_108_Theta_CA` | PNG | válida · 74.80 · 9.878,00 | «Foto» de una cotización: se lee con el modelo de visión. |
| `Propuesta_109_Iota_SA` | PNG | pendiente de revisión | Foto borrosa: ilegible. Nunca se descarta. |

**Ranking esperado** (también en `expected.json`): Beta, Alfa, Eta, Theta (válidas) · Iota (pendiente) · Gama, Delta,
Epsilon, Zeta (descartadas, por identificador). Eta queda tras Alfa porque la diferencia (7.9) supera δ.

## Regenerar

```bash
python muestras/generate.py        # usa el venv del backend: backend/.venv/bin/python muestras/generate.py
```

Es determinista (sin red, sin fechas ni ruido aleatorio sin semilla): dos ejecuciones dan archivos idénticos. La
prueba `test_committed_samples_and_expected_are_up_to_date` falla si cambias `generate.py` sin regenerar.
`generate.py` es la única fuente de verdad: de ahí salen los archivos, `expected.json` y lo que la prueba programa.

## Probar

```bash
cd backend && .venv/bin/python -m pytest tests/e2e -q
```

Corre el lector real, las reglas, el costo, el ranking y el CLI con un modelo falso programado con la extracción
esperada de cada muestra: prueba la cadena determinista, **no la IA**.

## Correr el lote con un modelo real

```bash
cd backend
export EVALUADOR_IA_PROVEEDOR=openai_compatible          # o anthropic
export EVALUADOR_IA_MODELO=qwen2.5:7b                      # el modelo debe tener visión para los PNG
export EVALUADOR_IA_BASE_URL=http://localhost:11434/v1
export EVALUADOR_IA_API_KEY=...                            # si el proveedor lo pide
PYTHONPATH=src .venv/bin/python -m evaluador.lote --lote ../muestras/lote --salida /tmp/salida.json
```

Con un modelo real los resultados pueden diferir de `expected.json` en lo cualitativo (alcance, puntajes); las causas
deterministas (aritmética, manipulación, alcance por lista fija) deben coincidir. Los nombres exactos de las variables
están en `backend/src/evaluador/composition/settings.py`.
