# EGM Drift Detection Report (Elephant-Goldfish Model)
Date: 2026-11-08
Target Workspace: `crm-bot-agent`
Analyzer: Antigravity EGM Plugin (`google/elephant-goldfish-model`)

---

## docs/DESIGN.md

* **Sistema de Temas Dual (Modo Claro & Oscuro)**: `DESIGN.md` especifica únicamente una paleta oscura estática (`--accent: #3b82f6` azul y fondos `#080b12`). En el código actual (`frontend/src/styles.scss` y componentes), el diseño evolucionó a soporte completo de Modo Claro (`theme-light`) y Modo Oscuro (`theme-dark`) con acentos de alta visibilidad (`#bef264` / `#c4f036`), bordes frosted glass y adaptabilidad de contraste.
* **Tipografía y Estilos de Tarjetas**: `DESIGN.md` establece estilos monocromáticos que no contemplaban las tarjetas de alta accesibilidad añadidas en `/equipo` (Asesores comerciales, switches de permisos granulares con texto negro sólido `#000000` en light mode).
* **Navegación Lateral Contraíble**: El documento original no describe la barra lateral colapsable (68px) con iconos centrados, badges de estado ni el popover flotante flyout para la sección de Configuración (`Plantillas`, `Equipo & Agentes`, `WhatsApp`, `Agente IA`, `Base de Conocimiento`, `Funnel`, `Webhooks`).
* **Nuevas Rutas y Módulos de Frontend**: No están referenciados en `DESIGN.md`:
  - `/equipo` (Gestión de Administradores y Asesores comerciales con switches de permisos).
  - `/simulador` (Consola interactiva compartible para demostraciones de ventas).
  - Módulo global de síntesis de audio para alertas (`SoundService` con WebAudio API).

---

## docs/API-v1.md

* **Rutas y Controladores Base**: **No drift detected** en las especificaciones existentes de:
  - `Auth`: `/auth/register`, `/auth/login`, `/auth/me`, `/v1/onboarding/tour` están 100% sincronizados con `backend/src/auth/`.
  - `Conversaciones`: Todos los endpoints (`/v1/conversations`, `messages`, `incoming`, `pause-bot`, `resume-bot`, `assign`, `read`, `resolve`) coinciden con `backend/src/v1/people.controllers.ts`.
  - `Contactos`: CRUD, pipeline Kanban, importación y exportación CSV coinciden con `backend/src/v1/people.controllers.ts`.
  - `Dashboard & Reportes`: `/v1/dashboard/stats` y `/v1/reports/summary` coinciden con `backend/src/v1/insights.controllers.ts`.
* **Funcionalidades Avanzadas de Backend No Tipadas en API-v1.md**:
  - `Módulo de Transcripción de Audio`: Lógica de procesamiento de notas de voz de WhatsApp (detección de intenciones `PRODUCT_INQUIRY`, `PAYMENT_REPORT`).
  - `Módulo de Validación de Comprobantes (OCR/Vision)`: Validación de transferencias bancarias (Banesco / Zelle), prevención de fraude por duplicados y extracción de referencias.
  - `RBAC Granular para Agentes`: Los permisos (`conversations:reply`, `payments:validate`, `catalog:edit`, `reports:view`) deben ser añadidos a los DTOs de `users` en la documentación oficial.
  - `Simulador Compartible`: Endpoints de sesión efímera (`simId`, `token`) para prospectos externos.
