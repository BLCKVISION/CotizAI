/** Lógica pura (sin React) para mostrar la transcripción: Markdown -> bloques, y texto -> segmentos con inciertos. */

export type Bloque =
  | { tipo: 'titulo'; nivel: number; texto: string }
  | { tipo: 'tabla'; cabecera: string[]; filas: string[][] }
  | { tipo: 'parrafo'; texto: string };

export type Segmento = { texto: string; incierto: boolean };

// Fila separadora de tabla Markdown: |---|:---:|---:|
const SEPARADOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const ENCABEZADO = /^(#{1,6})\s+(.*)$/;
const BARRA_ESCAPADA = '\u0000';

const esFila = (linea: string) => linea.trim().startsWith('|');

function celdas(linea: string): string[] {
  const sinEscapes = linea.trim().replace(/\\\|/g, BARRA_ESCAPADA);
  const interior = sinEscapes.replace(/^\|/, '').replace(/\|$/, '');
  return interior.split('|').map((c) => c.trim().split(BARRA_ESCAPADA).join('|'));
}

/** Una fila con menos celdas que la cabecera se completa; con más, se recorta: la tabla siempre queda rectangular. */
const ajustar = (fila: string[], ancho: number) => Array.from({ length: ancho }, (_, i) => fila[i] ?? '');

export function bloquesDeMarkdown(markdown: string): Bloque[] {
  const lineas = markdown.split(/\r?\n/);
  const bloques: Bloque[] = [];
  let parrafo: string[] = [];
  const cerrarParrafo = () => {
    if (parrafo.length > 0) bloques.push({ tipo: 'parrafo', texto: parrafo.join('\n') });
    parrafo = [];
  };

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    if (!linea.trim()) {
      cerrarParrafo();
      continue;
    }
    const encabezado = ENCABEZADO.exec(linea.trim());
    if (encabezado) {
      cerrarParrafo();
      bloques.push({ tipo: 'titulo', nivel: encabezado[1].length, texto: encabezado[2].trim() });
      continue;
    }
    if (esFila(linea) && i + 1 < lineas.length && SEPARADOR.test(lineas[i + 1])) {
      cerrarParrafo();
      const cabecera = celdas(linea);
      const filas: string[][] = [];
      i += 2;
      while (i < lineas.length && esFila(lineas[i])) {
        filas.push(ajustar(celdas(lineas[i]), cabecera.length));
        i++;
      }
      i--; // el `for` vuelve a sumar uno
      bloques.push({ tipo: 'tabla', cabecera, filas });
      continue;
    }
    parrafo.push(linea.trimEnd());
  }
  cerrarParrafo();
  return bloques;
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Parte `texto` en segmentos y marca los que coinciden literalmente con alguno de los `inciertos`. */
export function partirPorInciertos(texto: string, inciertos: string[]): Segmento[] {
  if (!texto) return [];
  const validos = [...new Set(inciertos.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (validos.length === 0) return [{ texto, incierto: false }];
  const conjunto = new Set(validos);
  const partes = texto.split(new RegExp(`(${validos.map(escaparRegex).join('|')})`));
  return partes.filter(Boolean).map((t) => ({ texto: t, incierto: conjunto.has(t) }));
}
