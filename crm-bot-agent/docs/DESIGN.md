# Dirección de diseño de Relay

**Paleta: la original de Relay/Replay-CRM, sin cambios.** El rediseño es de estructura, tipografía, composición y
detalle; los colores son los de siempre.

## Colores (tokens `:root` en `frontend/src/styles.scss`)
| Token | Valor |
|---|---|
| `--bg-deep` / `--bg-surface` | `#080b12` / `#0c101d` |
| `--bg-card` / `--bg-card-hover` | `rgba(13,18,30,.65)` / `rgba(18,24,40,.85)` |
| `--border-glass` / `--border-highlight` | `rgba(255,255,255,.07)` / `rgba(255,255,255,.12)` |
| `--accent` / `--accent-hover` | `#3b82f6` / `#2563eb` (`--accent-soft` `#60a5fa`) |
| `--accent-glow` / `--accent-dim` | `rgba(59,130,246,.35)` / `rgba(59,130,246,.14)` |
| `--text-primary` / `-secondary` / `-muted` / `-dim` | `#f8fafc` / `#94a3b8` / `#64748b` / `#475569` |
| Semánticos | verde `#10b981`/`#34d399`, ámbar `#f59e0b`/`#fbbf24`, rojo `#ef4444`/`#f87171`, naranja `#f97316`/`#fb923c` |

## Idea: «instrumento de precisión»
Un panel de control sobrio y editorial: negro azulado con retícula tenue, un único acento azul que aparece con
intención (filos luminosos, orbes, foco), y una voz tipográfica propia.

- **Tipografía** (self-hosted, `@fontsource-variable`): **Fraunces** (serif de contraste suave, con eje óptico) para titulares
  y cifras grandes; **Instrument Sans** para la interfaz; **Geist Mono** para SKUs y tokens. Cifras tabulares.
- **Profundidad por capas:** superficies con luz superior, borde fino de 1 px y sombras largas; en hover, filo azul y
  resplandor del propio acento. Retícula + grano SVG (data URI) como atmósfera.
- **Composición:** panel de marca dividido en login/registro (vista previa de conversación, órbitas y retícula en CSS),
  KPIs con orbe azul y cifra display de 42 px, títulos con filo azul, kanban con tarjetas físicas.
- **Movimiento:** entrada escalonada (`rise-in`, 60 ms entre elementos), transiciones de 150–250 ms, flotación suave de la
  vista previa; todo se desactiva con `prefers-reduced-motion`.
- **Responsive:** el menú lateral es un cajón deslizable bajo 820 px.
- **Accesibilidad:** foco visible (`:focus-visible`), contraste AA, sin emojis como iconos (Material Symbols).
- **CSP:** sin recursos externos (`default-src 'self'`); el grano usa `data:` y las fuentes salen del propio origen.


## Tipografía (actualizada)
Se usa **Inter** (variable, autoalojada) en toda la interfaz, la misma familia y pila que la wiki de Exmachina: `Inter, Helvetica Now Display, Helvetica Neue, Helvetica, Arial`. Los titulares y las cifras grandes van en peso 300 con tracking -0.035em (como `.title-xl` de la wiki); el cuerpo en 400 y las etiquetas en 500-600. Geist Mono solo para SKUs y tokens.
