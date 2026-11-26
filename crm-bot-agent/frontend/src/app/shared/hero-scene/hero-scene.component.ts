import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Escena animada del login: un cliente escribe por WhatsApp, el agente de IA responde, el stock baja y el pedido sale despachado.
 * CSS puro (sin JavaScript, sin recursos externos): arranca sola, se repite en bucle y respeta prefers-reduced-motion.
 * Todo el dibujo usa `em` sobre un lienzo de 52 × 46 que escala con el ancho del contenedor (container query units).
 */
@Component({
  selector: 'app-hero-scene',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'img',
    'aria-label': 'Animación: un cliente pregunta por WhatsApp, el agente de IA responde, descuenta el stock y el pedido sale despachado.',
  },
  template: `
    <div class="scene" aria-hidden="true">
      <!-- Plataforma isométrica -->
      <div class="floor f1"></div><div class="floor f2"></div>

      <!-- Líneas de luz entre las piezas -->
      <svg class="links" viewBox="0 0 52 46" preserveAspectRatio="none">
        <defs><linearGradient id="hs-g" x1="0" x2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
        <path d="M14 14 C 19 14, 17 18, 22 20" /><path d="M37 24 C 41 24, 40 27, 43 27" /><path d="M17 33 C 20 33, 19 31, 23 31" />
      </svg>

      <div class="stage">
        <!-- Teléfono con el chat de WhatsApp -->
        <div class="phone">
          <div class="notch"></div>
          <div class="screen">
            <div class="chat-head">
              <span class="avatar">L</span>
              <span class="who"><b>Lucía</b><small>en línea</small></span>
              <span class="material-symbols-rounded wa">chat</span>
            </div>
            <div class="msgs">
              <div class="bubble in b1">¿Tenéis la camiseta básica en M?</div>
              <div class="slot">
                <div class="typing t1"><i></i><i></i><i></i></div>
                <div class="bubble out b2">Sí, quedan 12 · 15 USD<br><span>≈ 1.340 Bs</span></div>
              </div>
              <div class="bubble in b3">¡La quiero! ¿Hacéis envío?</div>
              <div class="slot">
                <div class="typing t2"><i></i><i></i><i></i></div>
                <div class="bubble out b4"><span class="material-symbols-rounded">check_circle</span>Pedido confirmado<br><span>Sale hoy mismo</span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tarjeta de stock -->
        <div class="card stock">
          <div class="card-top"><span class="ico orange"><span class="material-symbols-rounded">inventory_2</span></span><div><b>Camiseta M</b><small>Stock</small></div></div>
          <div class="num"><span class="n na">12</span><span class="n nb">11</span><em>uds</em></div>
          <div class="bar"><i></i></div>
        </div>

        <!-- Tarjeta de pedido y despacho -->
        <div class="card order">
          <div class="card-top"><span class="ico green"><span class="material-symbols-rounded">local_shipping</span></span><div><b>Pedido #1042</b><small>Despacho</small></div></div>
          <div class="track"><span class="line"><i></i></span><span class="truck material-symbols-rounded">local_shipping</span></div>
          <div class="steps"><span class="s1">Nuevo</span><span class="s2">Empaque</span><span class="s3">Despachado</span></div>
        </div>

        <!-- Tarjeta del agente -->
        <div class="card agent">
          <div class="card-top"><span class="orb"><span class="material-symbols-rounded">smart_toy</span></span><div><b>Agente IA</b><small>activo</small></div></div>
          <ul>
            <li class="l1"><span class="material-symbols-rounded">check_circle</span>Consulta el stock</li>
            <li class="l2"><span class="material-symbols-rounded">check_circle</span>Reserva 1 unidad</li>
            <li class="l3"><span class="material-symbols-rounded">check_circle</span>Avisa a despacho</li>
          </ul>
        </div>
      </div>

      <div class="ping"><span class="material-symbols-rounded">notifications_active</span><b>Nuevo pedido</b></div>

      <!-- Destellos -->
      <i class="spark s-a"></i><i class="spark s-b"></i><i class="spark s-c"></i><i class="spark s-d"></i>
    </div>
  `,
  styles: `
    :host { display: block; width: 100%; max-width: 580px; aspect-ratio: 52 / 46; container-type: size; position: relative;
      --blue: #3b82f6; --cyan: #22d3ee; --violet: #8b5cf6; --pink: #f472b6; --green: #25d366; --amber: #fbbf24; --orange: #fb923c; --loop: 14s; }
    .scene { position: absolute; inset: 0; margin: auto; width: 52em; height: 46em; font-size: min(calc(100cqw / 52), calc(100cqh / 46)); perspective: 120em; perspective-origin: 50% 40%; }
    .stage { position: absolute; inset: 0; transform-style: preserve-3d; transform: rotateX(9deg) rotateY(-15deg); animation: sway 12s ease-in-out infinite; }

    /* Plataforma */
    .floor { position: absolute; left: 7em; top: 15em; width: 38em; height: 38em; border-radius: 4em; transform: rotateX(64deg) rotateZ(45deg); pointer-events: none; }
    .f1 { background: linear-gradient(135deg, rgba(34,211,238,.22), rgba(139,92,246,.30)); border: 1px solid rgba(139,92,246,.45); box-shadow: 0 0 5em rgba(139,92,246,.35), inset 0 0 4em rgba(34,211,238,.16); }
    .f2 { left: 12em; top: 20em; width: 28em; height: 28em; border: 1px solid rgba(34,211,238,.45); background: repeating-linear-gradient(45deg, rgba(34,211,238,.10) 0 1px, transparent 1px 3em); }

    /* Líneas de luz */
    .links { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .links path { fill: none; stroke: url(#hs-g); stroke-width: .22; stroke-linecap: round; stroke-dasharray: .9 1.1; animation: flow 1.4s linear infinite; filter: drop-shadow(0 0 .35em rgba(34,211,238,.8)); }

    /* Teléfono */
    .phone { position: absolute; left: 14em; top: 1.5em; width: 23em; height: 42em; border-radius: 3.6em; padding: .7em;
      background: linear-gradient(160deg, #3a4a6b, #141b2e); box-shadow: 0 3em 6em rgba(0,0,0,.55), 0 0 0 .15em rgba(255,255,255,.12) inset, 0 0 6em rgba(59,130,246,.35); transform: translateZ(2em); }
    .notch { position: absolute; z-index: 3; left: 50%; top: 1.4em; width: 6em; height: 1.2em; margin-left: -3em; border-radius: 1em; background: #05070d; }
    .screen { height: 100%; border-radius: 3em; overflow: hidden; background: linear-gradient(180deg, #0b141a, #0e1c24); display: flex; flex-direction: column; }
    .chat-head { display: flex; align-items: center; gap: .9em; padding: 3.2em 1.4em 1.1em; background: linear-gradient(135deg, #0a8f6a, #25d366); color: #04210f; }
    .avatar { width: 3.3em; height: 3.3em; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: 1.5em; color: #fff; background: linear-gradient(135deg, var(--pink), var(--violet)); box-shadow: 0 0 0 .2em rgba(255,255,255,.55); }
    .who { display: flex; flex-direction: column; line-height: 1.15; flex: 1; b { font-size: 1.5em; font-weight: 700; } small { font-size: 1.05em; opacity: .75; } }
    .wa { font-size: 2.2em !important; opacity: .85; }
    .msgs { flex: 1; display: flex; flex-direction: column; gap: 1em; padding: 1.4em 1.2em; justify-content: flex-start;
      background: radial-gradient(circle at 20% 10%, rgba(37,211,102,.07), transparent 40%), repeating-linear-gradient(45deg, rgba(255,255,255,.015) 0 .3em, transparent .3em 1.2em); }
    .bubble { max-width: 82%; padding: .85em 1.1em; border-radius: 1.4em; font-size: 1.3em; line-height: 1.35; color: #e9edef; opacity: 0; animation-duration: var(--loop); animation-iteration-count: infinite; animation-timing-function: cubic-bezier(.2,.8,.2,1); animation-fill-mode: both;
      span { opacity: .85; font-size: .88em; } .material-symbols-rounded { font-size: 1.3em; vertical-align: -.25em; margin-right: .25em; } }
    .bubble.in { align-self: flex-start; background: #1f2c34; border-top-left-radius: .4em; }
    .bubble.out { align-self: flex-end; background: linear-gradient(135deg, #25d366, #12b886); color: #052e1a; font-weight: 600; border-top-right-radius: .4em; box-shadow: 0 .4em 1.6em rgba(37,211,102,.35); }
    .b1 { animation-name: b1; } .b2 { animation-name: b2; } .b3 { animation-name: b3; } .b4 { animation-name: b4; }
    .slot { display: grid; } .slot > * { grid-area: 1 / 1; align-self: end; }
    .slot .out { justify-self: end; } .typing { justify-self: end; }
    .typing { display: inline-flex; gap: .45em; align-items: center; padding: 1em 1.2em; border-radius: 1.4em; background: rgba(37,211,102,.22); opacity: 0; animation-duration: var(--loop); animation-iteration-count: infinite; animation-fill-mode: both;
      i { width: .8em; height: .8em; border-radius: 50%; background: var(--green); animation: dot .9s ease-in-out infinite; &:nth-child(2) { animation-delay: .15s; } &:nth-child(3) { animation-delay: .3s; } } }
    .t1 { animation-name: t1; } .t2 { animation-name: t2; }

    /* Tarjetas */
    .card { position: absolute; padding: 1.5em 1.7em; border-radius: 2em; color: #f8fafc; background: linear-gradient(160deg, rgba(30,41,75,.96), rgba(14,20,40,.96)); border: 1px solid rgba(255,255,255,.14);
      box-shadow: 0 2.4em 5em rgba(0,0,0,.5), 0 0 0 .1em rgba(255,255,255,.04) inset; font-size: 1.15em; }
    .card-top { display: flex; align-items: center; gap: 1em; b { display: block; white-space: nowrap; font-size: 1.2em; font-weight: 700; line-height: 1.15; } small { color: #94a3b8; font-size: 1.05em; } }
    .ico, .orb { width: 3.4em; height: 3.4em; border-radius: 1.1em; display: grid; place-items: center; flex: none; .material-symbols-rounded { font-size: 2.1em; color: #fff; } }
    .ico.orange { background: linear-gradient(135deg, var(--amber), var(--orange)); box-shadow: 0 0 2em rgba(251,146,60,.6); }
    .ico.green { background: linear-gradient(135deg, #34d399, var(--green)); box-shadow: 0 0 2em rgba(37,211,102,.55); }
    .orb { border-radius: 50%; background: radial-gradient(circle at 30% 25%, #c4b5fd, var(--violet) 60%, #5b21b6); box-shadow: 0 0 2.4em rgba(139,92,246,.8); animation: pulse 2.4s ease-in-out infinite; }

    .stock { left: 0; top: 7em; width: 16.5em; transform: translateZ(7em); animation: bob 6s ease-in-out infinite; }
    .num { position: relative; display: flex; align-items: baseline; gap: .5em; height: 3.6em; margin: 1.1em 0 .8em; }
    .n { position: absolute; left: 0; font-size: 3.6em; font-weight: 800; line-height: 1; letter-spacing: -.03em; background: linear-gradient(135deg, #fde68a, var(--orange)); -webkit-background-clip: text; background-clip: text; color: transparent; animation-duration: var(--loop); animation-iteration-count: infinite; animation-fill-mode: both; }
    .na { animation-name: na; } .nb { animation-name: nb; } .num em { position: absolute; left: 3.6em; bottom: .35em; font-style: normal; color: #94a3b8; font-size: 1.2em; }
    .bar { height: .9em; border-radius: 1em; background: rgba(255,255,255,.1); overflow: hidden; i { display: block; height: 100%; width: 80%; border-radius: 1em; background: linear-gradient(90deg, var(--green), var(--amber), var(--orange)); animation: bar var(--loop) infinite both; } }

    .order { right: -1em; top: 10em; width: 18em; transform: translateZ(9em); animation: bob 7s ease-in-out -2s infinite; }
    .track { position: relative; height: 3em; margin: 1.5em 0 .6em; }
    .track .line { position: absolute; left: 0; right: 0; top: 1.3em; height: .7em; border-radius: 1em; background: rgba(255,255,255,.1); overflow: hidden; i { display: block; height: 100%; border-radius: 1em; background: linear-gradient(90deg, var(--cyan), var(--green)); animation: prog var(--loop) infinite both; } }
    .truck { position: absolute; top: -.2em; left: 0; font-size: 2.6em !important; color: #fff; filter: drop-shadow(0 0 .5em rgba(37,211,102,.9)); animation: ride var(--loop) infinite both; }
    .steps { display: flex; justify-content: space-between; gap: .5em; font-size: .85em; white-space: nowrap; font-weight: 700; color: #64748b;
      span { animation-duration: var(--loop); animation-iteration-count: infinite; animation-fill-mode: both; } .s1 { animation-name: st1; } .s2 { animation-name: st2; } .s3 { animation-name: st3; } }

    .agent { right: .5em; top: 28.5em; width: 16em; transform: translateZ(6em); animation: bob 6.5s ease-in-out -4s infinite; }
    .agent ul { list-style: none; margin-top: 1.1em; display: flex; flex-direction: column; gap: .7em; }
    .agent li { display: flex; align-items: center; gap: .6em; font-size: 1.1em; font-weight: 600; color: #cbd5e1; opacity: .35; animation-duration: var(--loop); animation-iteration-count: infinite; animation-fill-mode: both;
      .material-symbols-rounded { font-size: 1.5em; color: var(--green); } }
    .l1 { animation-name: li1; } .l2 { animation-name: li2; } .l3 { animation-name: li3; }

    .ping { position: absolute; left: 2em; top: 33em; display: inline-flex; align-items: center; gap: .7em; padding: 1em 1.6em 1em 1.2em; border-radius: 3em; font-size: 1.3em; color: #fff;
      background: linear-gradient(135deg, var(--pink), var(--violet)); box-shadow: 0 1.2em 3em rgba(244,114,182,.45); opacity: 0; animation: ping var(--loop) infinite both; transform: translateZ(8em);
      .material-symbols-rounded { font-size: 1.5em; } b { font-weight: 700; } }
    @keyframes ping { 0%, 52% { opacity: 0; transform: translateZ(8em) translateY(1.2em) scale(.85); } 56%, 70% { opacity: 1; transform: translateZ(8em) translateY(0) scale(1); } 76%, 100% { opacity: 0; transform: translateZ(8em) translateY(-1em) scale(.95); } }

    /* Destellos */
    .spark { position: absolute; width: .9em; height: .9em; border-radius: 50%; animation: drift 7s ease-in-out infinite; }
    .s-a { left: 3em; top: 3em; background: var(--pink); box-shadow: 0 0 1.4em var(--pink); } .s-b { right: 4em; top: 6em; background: var(--cyan); box-shadow: 0 0 1.4em var(--cyan); animation-delay: -2s; }
    .s-c { right: 2em; bottom: 5em; background: var(--amber); box-shadow: 0 0 1.4em var(--amber); animation-delay: -4s; } .s-d { left: 9em; bottom: 2em; background: var(--violet); box-shadow: 0 0 1.4em var(--violet); animation-delay: -1s; }

    /* Línea de tiempo del ciclo (14 s): 1 pregunta → 2 escribe → 3 responde → 4 pide → 5 escribe → 6 confirma → stock baja → despacho */
    @keyframes b1 { 0%, 1% { opacity: 0; transform: translateY(1.2em) scale(.94); } 4%, 91% { opacity: 1; transform: none; } 96%, 100% { opacity: 0; transform: translateY(-.6em); } }
    @keyframes t1 { 0%, 11% { opacity: 0; } 13%, 20% { opacity: 1; } 22%, 100% { opacity: 0; } }
    @keyframes b2 { 0%, 21% { opacity: 0; transform: translateY(1.2em) scale(.94); } 24%, 91% { opacity: 1; transform: none; } 96%, 100% { opacity: 0; transform: translateY(-.6em); } }
    @keyframes b3 { 0%, 34% { opacity: 0; transform: translateY(1.2em) scale(.94); } 37%, 91% { opacity: 1; transform: none; } 96%, 100% { opacity: 0; transform: translateY(-.6em); } }
    @keyframes t2 { 0%, 42% { opacity: 0; } 44%, 50% { opacity: 1; } 52%, 100% { opacity: 0; } }
    @keyframes b4 { 0%, 51% { opacity: 0; transform: translateY(1.2em) scale(.94); } 54%, 91% { opacity: 1; transform: none; } 96%, 100% { opacity: 0; transform: translateY(-.6em); } }
    @keyframes na { 0%, 55% { opacity: 1; transform: none; } 59%, 100% { opacity: 0; transform: translateY(-.5em) scale(.9); } }
    @keyframes nb { 0%, 55% { opacity: 0; transform: translateY(.6em) scale(1.1); } 60%, 92% { opacity: 1; transform: none; } 97%, 100% { opacity: 0; } }
    @keyframes bar { 0%, 55% { width: 80%; } 62%, 92% { width: 73%; } 100% { width: 80%; } }
    @keyframes li1 { 0%, 14% { opacity: .35; } 18%, 92% { opacity: 1; } 97%, 100% { opacity: .35; } }
    @keyframes li2 { 0%, 54% { opacity: .35; } 58%, 92% { opacity: 1; } 97%, 100% { opacity: .35; } }
    @keyframes li3 { 0%, 64% { opacity: .35; } 68%, 92% { opacity: 1; } 97%, 100% { opacity: .35; } }
    @keyframes prog { 0%, 56% { width: 0; } 70% { width: 50%; } 86%, 92% { width: 100%; } 97%, 100% { width: 0; } }
    @keyframes ride { 0%, 56% { left: 0; opacity: .6; } 86%, 92% { left: calc(100% - 2.6em); opacity: 1; } 97%, 100% { left: 0; opacity: .6; } }
    @keyframes st1 { 0%, 56% { color: #64748b; } 58%, 92% { color: var(--cyan); } 97%, 100% { color: #64748b; } }
    @keyframes st2 { 0%, 68% { color: #64748b; } 70%, 92% { color: var(--amber); } 97%, 100% { color: #64748b; } }
    @keyframes st3 { 0%, 85% { color: #64748b; } 87%, 92% { color: var(--green); text-shadow: 0 0 1em rgba(37,211,102,.8); } 97%, 100% { color: #64748b; } }

    @keyframes dot { 0%, 100% { transform: translateY(0); opacity: .45; } 50% { transform: translateY(-.35em); opacity: 1; } }
    @keyframes flow { to { stroke-dashoffset: -4; } }
    @keyframes bob { 0%, 100% { margin-top: 0; } 50% { margin-top: -1.1em; } }
    @keyframes sway { 0%, 100% { transform: rotateX(9deg) rotateY(-17deg); } 50% { transform: rotateX(7deg) rotateY(-10deg); } }
    @keyframes pulse { 0%, 100% { box-shadow: 0 0 1.6em rgba(139,92,246,.6); } 50% { box-shadow: 0 0 3.2em rgba(139,92,246,1); } }
    @keyframes drift { 0%, 100% { transform: translate(0, 0) scale(1); opacity: .9; } 50% { transform: translate(1em, -1.6em) scale(1.5); opacity: .4; } }

    /* Movimiento reducido: pose fija con el pedido ya despachado */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; }
      .stage { transform: rotateX(9deg) rotateY(-14deg); }
      .bubble { opacity: 1; transform: none; } .typing, .na { opacity: 0; } .nb { opacity: 1; }
      .ping { opacity: 1; transform: translateZ(8em); } .bar i { width: 73%; } .track .line i { width: 100%; } .truck { left: calc(100% - 2.6em); } .agent li { opacity: 1; } .steps .s3 { color: var(--green); }
    }
  `,
})
export class HeroSceneComponent {}
