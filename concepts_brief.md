# Rediseño de la interfaz de CotizAI

* **Author:** Albert
* **Date:** 2026-11-26

## Overview

CotizAI es la web de un agente que compara de 3 a 20 propuestas económicas de proveedores (PDF, fotos de
presupuestos manuscritos, XLSX y capturas de chat) contra un documento de proyecto, y recomienda la mejor
con evidencia. Es la entrega de un hackatón: el jurado califica 75 de 100 puntos por la plataforma
(funcionamiento real, claridad de la interfaz, trazabilidad, normalización financiera y reportes) y 25 por un
archivo `salida.json` que genera un modo lote.

El rediseño cubre **toda la web** (inicio de sesión incluido):

1. **Se entiende desde el login.** La pantalla de acceso explica qué hace la app: analizar los presupuestos
   de un proyecto a partir de documentos, imágenes y hojas de cálculo.
2. **«Home» en lugar de «Resumen».** Un recorrido guiado de tres pasos: subir el proyecto → subir las
   propuestas → evaluar y recibir una recomendación. Home muestra una sola acción principal según el punto
   en que va el usuario y lo que su rol permite.
3. **Estilo** inspirado en un panel tipo «Sales Hub»: moderno y minimalista, con mucho espacio libre,
   vidrio esmerilado (glassmorphism), un degradado azul o azul verdoso como acento y **sin verde lima**.
   Barra lateral **desplegable** (iconos con nombre al expandir). Animaciones suaves y breves que respetan
   «reducir movimiento».
4. **100vh en computadora.** La estructura ocupa la altura de la ventana y no hay tarjetas cortadas. Las
   vistas largas se dividen en secciones o pestañas, o desplazan solo dentro de un panel. Objetivo: 1366×768
   como mínimo y 1920×1080; en móvil, versión usable con desplazamiento normal.
5. **Sin resultados inventados.** El motor de evaluación aún no está conectado: la interfaz lo dice con claridad.

## Restricciones

* Código nuevo en inglés; texto de la interfaz en español (`AGENTS.md`).
* Expo Router + React Native Web; tokens en `frontend/src/design/tokens.ts` y `tema.ts`.
* Contraste ≥ 4.5:1, objetivos táctiles ≥ 44 px, foco visible.
* El desarrollo termina el 27-11-2026: el rediseño no puede consumir el tiempo del motor de evaluación.

## Código relevante

* `frontend/src/design/` (tokens, tema, efectos, componentes, layout, ShellDeApp, gráficos, bloques)
* `frontend/src/app/(auth)/login.tsx`, `frontend/src/app/(app)/*.tsx`, `frontend/src/features/`
* `design-system/agente-evaluador/MASTER.md`, `docs/SYSTEM_DESIGN.md`

## Analysis

Siete revisores Goldfish (diseño, código, alcance, comprensión, preparación, estructura y catalizador
inventivo) revisaron esta propuesta el 26-11-2026. Conclusiones:

* **Es un cambio de tokens, textos, estructura y Home; no una reconstrucción.** El vidrio, el fondo, las
  animaciones escalonadas y el modelo de navegación por rol ya existían. Límite de tiempo: unas 4 horas.
* **100vh no era posible con la página actual,** porque cada pantalla iba dentro de un único `ScrollView`.
  Hace falta una página fija en la que solo ciertos paneles se desplacen, y solo a partir de 1024 px de ancho.
* **El paso 3 no se puede completar todavía:** el motor no está conectado. Se muestra visible pero bloqueado,
  con un texto único.
* **Cada rol necesita su propia «siguiente acción»,** calculada por una función pura con pruebas.
* **El vidrio baja el contraste:** el texto va sobre superficies opacas y el degradado usa tonos oscuros
  (5,4:1 a 10,4:1 con texto blanco).
* **«Reducir movimiento» se leía tarde:** en web hay que consultarlo de forma síncrona y desactivar también
  las transiciones CSS.
* **Renombrar la ruta rompe enlaces:** `/resumen` debe redirigir a `/home`.

## Goals vs. Non-Goals

* **In-Scope Goals:** inicio de sesión explicativo; Home a 100vh con recorrido de 3 pasos por rol; acento
  azul con degradado; barra lateral desplegable; estado honesto del motor; «reducir movimiento».
* **Out-of-Scope Non-Goals:** rehacer a 100vh Estadísticas, Proveedores, Auditoría y el detalle del
  proyecto (heredan los colores nuevos); resultados simulados.

## Alternatives Weighed

* Dividir cada pantalla en pestañas para evitar el desplazamiento: descartado por los revisores, porque el
  detalle del proyecto ya tiene pestañas y aumentaría el trabajo.
* Animar el ancho de la barra con `Animated`: descartado en favor de una transición CSS en web, más simple.

## Key Decisions & Staging for Next Steps

Aplicado el 26-11-2026:

1. Tokens `accent`, `accentPressed`, `onAccent` y `gradient` (sin verde lima) y `accentGradient()`.
2. `FixedPage`: altura de la ventana en escritorio y tableta, con un modo compacto por debajo de 860 px de alto.
3. Home (`/home`) con `buildJourney(role, …)` y 6 pruebas unitarias; `/resumen` redirige a `/home`.
4. Inicio de sesión con los 3 pasos, los formatos admitidos y las cuentas de demostración.
5. Barra lateral desplegable que recuerda su estado en el navegador, con `aria-expanded`.
6. «Reducir movimiento» síncrono en web y transiciones CSS desactivadas cuando se pide.

Pendiente: llevar las demás pantallas a 100vh y unificar el aviso «motor sin conectar» en un solo componente.
