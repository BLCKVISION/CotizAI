# Prompt para la presentación de CotizAI

Pegue el bloque siguiente en un asistente de IA (Claude, ChatGPT, Gamma, etc.). Complete los `[COMPLETAR]` de
costos con las cifras reales antes de usarlo.

````text
Actúa como un experto en comunicación de proyectos tecnológicos y en pitch para hackatones. Necesito que
construyas la PRESENTACIÓN FINAL (guion de exposición de ~10 minutos + estructura de diapositivas con el
texto de cada una y sugerencia visual) del proyecto descrito abajo. Tono: profesional, claro y convincente;
idioma: español (Venezuela). Público: jurado del hackatón (perfil técnico y de negocio). Usa SOLO los datos
que te doy; si falta un dato, márcalo como [COMPLETAR] en vez de inventarlo.

═══ 1. IDENTIDAD ═══
Nombre: CotizAI — Agente Evaluador de Propuestas de Servicios.
Evento: Hackatón Venezuela INNOVA 2026 · Reto grupal (IA, Desarrollo de Software y Ciberseguridad).
Equipo: Emanuel Jimenez (Backend), Albert Fonseca (Frontend y diseñador del logotipo), Deivy Morales
(Infraestructura), Nikolas Rivas (Infraestructura), Aristides Rodriguez (UA).
Demo en vivo: hackathon.exmachina.systems / cotiz-ai.exmachina.systems.

═══ 2. EL QUÉ Y EL PARA QUÉ ═══
QUÉ: una plataforma web/móvil que recibe el requerimiento de un proyecto y de 3 a 20 propuestas de
proveedores (PDF digital o escaneado, fotos de presupuestos, XLSX), las lee con IA multimodal, las evalúa con
reglas y entrega un ranking explicado con evidencia.
PARA QUÉ: comparar ofertas a mano es lento y deja pasar fletes ocultos, errores de cálculo, condiciones
desfavorables e incluso intentos de manipulación. CotizAI reduce el tiempo de evaluación, hace visible el costo
real y deja trazabilidad completa para que el comité decida con confianza.
Caso del reto: dotar un laboratorio de 11 computadoras.
Principio rector: "La IA lee y propone; el código calcula y decide; la persona adjudica."

═══ 3. OBJETIVOS ═══
General: automatizar y volver auditable la evaluación comparativa de propuestas de proveedores, reduciendo
errores y riesgo, sin quitarle la decisión final al comité.
Específicos:
1. Ingerir documentos heterogéneos (PDF, PDF escaneado, imágenes, XLSX, incluido contenido oculto) y
   transcribirlos a texto estructurado.
2. Descartar propuestas con causa y cita textual (siete causas: ALCANCE, COMPAT, CAPACIDAD, CALIDAD, ABUSIVO,
   ARITMETICA, MANIPULACION).
3. Calcular el costo real (TCO) paso a paso con aritmética exacta (Decimal) y conversión de moneda con tasa
   oficial del BCV o manual, siempre trazable.
4. Ordenar las propuestas válidas y explicar cada decisión.
5. Gestionar la revisión humana: cada propuesta se verifica con sí/no y justificación si contradice a la IA.
6. Generar informes (PDF con espacio para firmas, Excel, Markdown) y el archivo salida.json del modo lote.
7. Garantizar seguridad, aislamiento entre organizaciones y auditoría con huellas encadenadas.

═══ 4. PÚBLICO DIRIGIDO ═══
Comités de compras y licitaciones, instituciones públicas y educativas, pymes y áreas administrativas que
comparan cotizaciones; auditores y entes de control que necesitan trazabilidad.
Roles dentro de la plataforma: cargador, evaluador, coordinador, aprobador, auditor (mínimo privilegio;
adjudicar es solo del aprobador; la auditoría es solo del auditor).

═══ 5. FUNCIONALIDADES ═══
- Flujo guiado en 5 pasos: datos → propuestas → análisis de la IA → verificación humana → resultado.
- Carga de hasta 20 propuestas por proyecto, cifradas con AES-256-GCM; análisis por tandas de 1 a 5 en la
  plataforma; modo lote sin límite.
- Lectura multimodal: pdfplumber (PDF), openpyxl (XLSX con fórmulas, comentarios y hojas ocultas), modelo con
  visión (imágenes y escaneos), Tesseract como respaldo (siempre marcado para revisión).
- Reglas de descarte con cita textual; detección de manipulación (texto oculto/diminuto, instrucciones
  dirigidas a la IA).
- Costo real paso a paso, tasa BCV o manual, antecedentes de descarte del proveedor, directorio de proveedores.
- Búsqueda web de precios de mercado (Perplexity Sonar): implementada y apagada por defecto para controlar costo.
- Evaluación selectiva: agregar propuestas y re-evaluar solo las elegidas.
- Preguntas sobre un proyecto evaluado, con citas (RAG).
- Traza por propuesta: pasos del agente, hallazgos, costo y veredicto.
- Informes en PDF, Excel y Markdown; salida.json (modo lote CLI).
- Registro de cuentas con organización aislada (multi-tenant).
- Interfaz accesible (contraste ≥ 4.5:1, objetivos táctiles ≥ 44 px, "reducir movimiento"); una base de código
  para web, iOS y Android.
Resultado verificable: el lote oficial se procesó en ~58 segundos y generó salida.json con el commit exacto.
Limitaciones honestas (decirlas suma credibilidad): sin envío de correos, asistente conversacional con
herramientas desactivado, avance durante la evaluación es estimado, cifrado en reposo solo en documentos
originales.

═══ 6. ARQUITECTURA ═══
- Monolito modular con arquitectura hexagonal (Ports & Adapters): adapters → application → domain. El dominio
  no importa nada externo; solo composition/ conoce las clases concretas. Sin microservicios, Kubernetes ni Redis.
- Backend: Python 3.12, FastAPI, Pydantic, LangGraph, SQLAlchemy/Alembic.
- Motor de IA como pipeline LangGraph: recuperar contexto (RAG) → extraer (LLM) → manipulación (código) →
  aritmética (Decimal) → alcance (lista fija + LLM) → decidir (código). El LLM solo extrae y juzga lo
  cualitativo; el veredicto sale de hallazgos con evidencia, nunca de un número del modelo.
- RAG: fragmentos 900/120, embeddings locales gratuitos (paraphrase-multilingual-MiniLM-L12-v2, 384 dim),
  PostgreSQL 16 + pgvector (coseno, HNSW), siempre filtrado por tenant.
- Modelos intercambiables por configuración (OpenRouter/OpenAI-compatible, Anthropic, Ollama local):
  cambiar de modelo = cambiar variables de entorno.
- Frontend: Expo / React Native + web, Expo Router; capas app → features → core → design.
- Infraestructura: Docker Compose, nginx del host, Certbot (TLS), API y base de datos en contenedores sin
  puertos públicos; despliegue repetible con infra/deploy.sh.
- Patrones: Strategy+Factory (proveedores de IA), State (estados del proyecto), Pipeline (LangGraph),
  Repository, Value Object, Guard/Interceptor, DTO. Cumple SOLID.
Incluye un diagrama simple: Usuario → App Expo → nginx/TLS → API FastAPI → (PostgreSQL+pgvector | Motor
LangGraph → LLM + embeddings locales).

═══ 7. SEGURIDAD ═══
- Prompt Injection: las propuestas son datos no confiables; el documento viaja en un bloque <documento>
  etiquetado; el modelo no tiene herramientas; salida validada con Pydantic; las instrucciones ocultas se
  detectan con patrones en código y la propuesta se descarta citando la evidencia.
- Un error de lectura no es culpa del proveedor: se relee una vez; si persiste queda "pendiente de revisión",
  nunca "descartada".
- Autenticación: Argon2id; JWT HS256 con emisor/audiencia/vigencia; sesión en servidor con SHA-256 del token,
  expiración por inactividad (30 min) y vida máxima (8 h); logout revoca.
- Sin enumeración de usuarios (mismo 401, mismo tiempo); bloqueo tras 5 fallos; límite 10 intentos/min por IP.
- Multi-tenant por construcción: el tenant sale de la sesión en el servidor, nunca del cliente; recurso de
  otra organización responde 404; el índice vectorial también filtra por tenant.
- Autorización por permisos en dos capas (guard HTTP y caso de uso).
- Cifrado: AES-256-GCM en documentos, TLS en tránsito; secretos solo en .env fuera de git.
- Auditoría con huellas encadenadas; logs JSON con trackId y censura de datos sensibles (contraseñas, tokens,
  RIF, correos).
- Contenedores: no-new-privileges, cap_drop ALL, sistema de archivos de solo lectura, usuario no root;
  nginx con límite de peticiones; cabeceras de seguridad, CORS con lista explícita, docs OpenAPI apagadas en
  producción, tope de 1 MiB por payload.
- Calidad: pruebas con pytest, lint con Ruff, tipos con mypy y TypeScript; auditoría de vulnerabilidades.

═══ 8. COSTOS ═══
Presenta un análisis de costos honesto con estas piezas (completa las cifras con [COMPLETAR]):
- Modelo de extracción/visión vía OpenRouter: google/gemini-2.5-flash-lite en la plataforma y
  google/gemini-2.5-flash en el lote oficial (lee mejor cotizaciones desglosadas). Costo por propuesta:
  [COMPLETAR]. Costo del lote oficial: [COMPLETAR].
- Embeddings: 0 USD (modelo local fastembed).
- Tasa de cambio BCV: 0 USD (fuente pública).
- Búsqueda de precios de mercado (Perplexity Sonar): apagada por defecto; si se activa, máximo 5 consultas
  por propuesta. Costo: [COMPLETAR].
- Alternativa de costo cero: Ollama local (qwen2.5:7b) sin pagar por inferencia.
- Infraestructura: un servidor con Docker, nginx y PostgreSQL/pgvector de código abierto; costo mensual
  [COMPLETAR].
- Herramientas de desarrollo: Claude Code como asistente de IA.
- Comparativo clave: tiempo y costo de una evaluación manual de N propuestas [COMPLETAR] vs. CotizAI (~58 s
  para el lote oficial). Resalta el retorno: horas ahorradas, errores evitados, fletes ocultos detectados.
Estrategias de control de costo: modelos intercambiables, funciones caras apagadas por defecto, embeddings
locales, tandas de análisis acotadas.

═══ 9. ESTRUCTURA PEDIDA ═══
Entrega, en este orden:
1. Guion de exposición con tiempos (10 min) y reparto sugerido por integrante según su rol.
2. 12–14 diapositivas: título, problema, solución (qué y para qué), objetivos, público, funcionalidades,
   demo (flujo de 5 pasos), arquitectura, motor de IA, seguridad, costos y retorno, resultados (salida.json,
   58 s), limitaciones y siguientes pasos, cierre. Por cada una: título, 3–5 viñetas cortas y sugerencia visual.
3. Frase de apertura impactante y frase de cierre.
4. 8 preguntas probables del jurado con respuesta breve (seguridad, alucinaciones, costos, escalabilidad,
   por qué el código decide y no la IA, privacidad de los documentos).
5. Checklist de demo en vivo de 3 minutos con plan B si falla internet o el modelo.
````
