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

/** Rellena con vacíos hasta `ancho`: la tabla siempre queda rectangular y nunca se descarta una celda (en un
 * presupuesto, perder el total por un «|» suelto en una descripción es peor que mostrar una columna sobrante). */
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
      const cabeceraCruda = celdas(linea);
      const crudas: string[][] = [];
      i += 2;
      while (i < lineas.length && esFila(lineas[i])) {
        crudas.push(celdas(lineas[i]));
        i++;
      }
      i--; // el `for` vuelve a sumar uno
      const ancho = Math.max(cabeceraCruda.length, ...crudas.map((f) => f.length));
      bloques.push({ tipo: 'tabla', cabecera: ajustar(cabeceraCruda, ancho), filas: crudas.map((f) => ajustar(f, ancho)) });
      continue;
    }
    parrafo.push(linea.trimEnd());
  }
  cerrarParrafo();
  return bloques;
}

const PARTE_DE_CIFRA = /[\d.,?]/;

/** Parte `texto` en segmentos y marca los que coinciden literalmente con alguno de los `inciertos`. Un incierto que
 * empieza o termina en carácter de cifra solo cuenta como valor completo: el «3» incierto no marca el de «1.325,00». */
export function partirPorInciertos(texto: string, inciertos: string[]): Segmento[] {
  if (!texto) return [];
  const validos = [...new Set(inciertos.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (validos.length === 0) return [{ texto, incierto: false }];
  const coincide = (v: string, pos: number) => {
    if (!texto.startsWith(v, pos)) return false;
    const antes = texto[pos - 1];
    const despues = texto[pos + v.length];
    if (PARTE_DE_CIFRA.test(v[0]) && antes !== undefined && PARTE_DE_CIFRA.test(antes)) return false;
    if (PARTE_DE_CIFRA.test(v[v.length - 1]) && despues !== undefined && PARTE_DE_CIFRA.test(despues)) return false;
    return true;
  };
  const segmentos: Segmento[] = [];
  let normal = '';
  for (let i = 0; i < texto.length; ) {
    const v = validos.find((x) => coincide(x, i));
    if (v) {
      if (normal) segmentos.push({ texto: normal, incierto: false });
      normal = '';
      segmentos.push({ texto: v, incierto: true });
      i += v.length;
    } else {
      normal += texto[i];
      i++;
    }
  }
  if (normal) segmentos.push({ texto: normal, incierto: false });
  return segmentos;
}
