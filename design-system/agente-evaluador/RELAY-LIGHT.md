# CotizAI · Sistema visual «Relay claro»

Derivado del tema claro de `crm-bot-agent` (`styles.scss`, bloque `body.theme-light`). Solo tema claro.
Este archivo **prevalece** sobre `MASTER.md` en color, forma, tipografía y movimiento.

## Qué hace Relay (tema claro) y cómo lo adaptamos

| Aspecto | Relay | CotizAI |
|---|---|---|
| Fondo | `#EFF1F5` + dos halos radiales: durazno `rgba(254,215,170,.38)` arriba-derecha y menta `rgba(187,247,208,.30)` abajo-izquierda | Igual (solo web; en nativo, color liso) |
| Tarjetas | Blanco `.90`, `backdrop-blur 28px`, borde blanco `.95`, radio 24–26, sombra `0 8 30 -4 rgba(0,0,0,.06)` + `0 2 6 rgba(0,0,0,.02)` + luz interior blanca | Igual; en nativo, sombra equivalente sin blur |
| Sidebar | Flotante, radio 28, blanco `.82` con blur 32, margen del viewport 14–20 | Igual |
| Ítem de navegación | Píldora radio 15; activo = blanco puro elevado (`translateY(-1)`), texto negro 600 | Igual, más un punto lima |
| Acento | Negro `#0F172A` para estados activos; **lima `#D4F938`** para el CTA y el dato destacado (barra activa, punto «en vivo») | Botón primario lima con texto negro; resto negro/blanco |
| Tipografía | Urbanist, peso 300 en cuerpo y cifras, 500 en títulos de tarjeta, 600–700 en activo | Urbanist: display y cifras 300 con tracking negativo; cuerpo 400 (más legible que 300) |
| Texto secundario | `#64748B`, a veces `#94A3B8` | Solo `#556070` o más oscuro (AA sobre `#EFF1F5`) |
| Movimiento | `relayStaggerIn` 500 ms, `cubic-bezier(.16,1,.3,1)`, escalones de 60 ms, `translateY(18px) scale(.99)`; hover de tarjeta `translateY(-2px)` en 250 ms; donut con `stroke-dashoffset` 600 ms | Igual; además cifras que cuentan hasta su valor; todo se apaga con *reduce motion* |
| Radios | 8 / 12 / 18 / 24–28 | 8 / 12 / 16 / 24 / 28 |

## Mejoras sobre Relay
- Contraste AA en todo el texto (Relay usa `#94A3B8` sobre blanco: 2.6:1).
- Anillo de foco visible (Relay lo anula con `outline: none`).
- *Reduce motion* respetado (Relay no lo considera).
- Tamaño táctil mínimo de 48 px y sin color como único indicador de estado (insignias con icono + texto).
- Un solo origen de verdad: tokens en `src/design/tokens.ts` y `tema.ts`, sin `!important`.

## Tokens
Ver `frontend/src/design/tokens.ts` (escala, radios, sombras, easing, tipografía) y `tema.ts` (paleta).
