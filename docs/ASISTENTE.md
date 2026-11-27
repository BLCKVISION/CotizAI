# Asistente de presupuestos

Conversación sobre los presupuestos de **una** organización: consulta, compara, busca precios de referencia en la web,
recomienda y genera reportes. Usa su propio grafo de LangGraph, separado del evaluador.

## Flujo

`screen → agent ⇄ tools → verify` (un reintento). Grafo: `adapters/outbound/agente/assistant_graph.py`.

## Uso

`POST /api/v1/assistant/messages` con `{"message": "...", "conversation_id": "..."}` (el segundo es opcional).
Requiere el permiso `ver_resultados`. La respuesta trae `answer`, `refusal`, `tools_used`, `links` y `reports`
(`filename`, `format`: `pdf`, `xlsx`, `md` o `csv`; `media_type`, `content_base64`). PDF es el formato por defecto.
El botón de descarga de la evaluación (`GET /proyectos/{id}/evaluations/report?fmt=`) admite los mismos cuatro formatos. Todavía no hay pantalla en la aplicación.

## Herramientas (solo lectura)

`list_projects`, `get_project`, `get_evaluation`, `compare_proposals`, `compare_projects`, `get_recommendations`,
`list_suppliers`, `search_market_price`, `generate_report` (evaluación, comparativa, recomendaciones, presupuestos).

Las diferencias, porcentajes, recomendaciones y reportes se calculan en código. En las comparativas la referencia es la
propuesta válida más barata.

## Barreras

| Barrera | Dónde | Qué hace |
|---|---|---|
| Organización | herramientas | Ninguna recibe la organización: sale de la sesión. Un id ajeno responde «no encontrado» |
| Permisos | casos de uso | Los mismos que la API; una herramienta no permitida ni se ofrece |
| Filtro de entrada | `domain/assistant/guardrails.py` | Corta manipulaciones evidentes sin llamar al modelo |
| Filtro de alcance | modelo | Rechaza temas ajenos y otras organizaciones; si la respuesta no es clara, rechaza |
| System prompt | `application/use_cases/assistant/prompt.py` | Guía el comportamiento; no es la frontera de seguridad |
| Texto de proveedores | herramientas | Se retiran instrucciones dirigidas a la IA antes de que el modelo las lea |
| Búsqueda web | herramientas | Quita nombres propios registrados, correos, RIF, teléfonos y enlaces; máximo 5 por mensaje |
| Respuesta | `check_answer` | Bloquea fugas del prompt y claves, y afirmaciones de haber actuado; retira enlaces no devueltos por una herramienta; exige que montos y porcentajes estén en los datos |
| Límites | HTTP y grafo | 12 mensajes por minuto y usuario; rondas de herramientas acotadas |
| Registro | auditoría y logs | Se anota qué herramientas se usaron, no el texto escrito |

Límites conocidos: la verificación de cifras comprueba que cada una **exista** en los datos, no que esté asignada a
la propuesta correcta; no revisa cantidades pequeñas sin moneda (p. ej. meses). La limpieza de la búsqueda web solo
conoce los nombres registrados. La memoria de conversación se pierde al reiniciar la API. Las evaluaciones guardadas
antes de este cambio no tienen las líneas cotizadas: hay que reevaluar para contrastar precios por producto.

## Pruebas y evals

- Sin red, con un modelo falso que intenta romper las barreras:
  `pytest tests/domain/test_assistant_guardrails.py tests/adapters/test_assistant_api.py`
- Con el modelo real (gasta saldo), 31 casos con datos ficticios de dos organizaciones:
  `python -m evals.assistant.run [--only scope,isolation] [--repeat 3] [--out informe.md]` (desde `backend/`).
  Falla si algún caso de seguridad falla o si pasa menos del 90 %.
