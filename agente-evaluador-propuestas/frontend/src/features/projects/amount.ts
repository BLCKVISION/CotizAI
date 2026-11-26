/**
 * Interpreta un monto escrito por una persona, con formato es-VE ("1.500,50") o simple ("1500.5").
 * Devuelve null si no es un número finito válido. Reglas:
 * - Solo dígitos, espacios, '.' y ','.
 * - Si hay ambos, el último separador es el decimal y el otro es de miles.
 * - Un solo separador repetido es de miles ("1.500.000").
 * - Un solo separador una vez: ',' es decimal; '.' es de miles solo si le siguen exactamente 3 dígitos ("1.500").
 */
export function parseAmount(text: string): number | null {
  const t = text.trim().replace(/\s+/g, '');
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const lastComma = t.lastIndexOf(',');
  const lastPoint = t.lastIndexOf('.');
  let decimal: string | null = null;
  if (lastComma >= 0 && lastPoint >= 0) decimal = lastComma > lastPoint ? ',' : '.';
  else if (lastComma >= 0 && t.indexOf(',') === lastComma) decimal = ',';
  else if (lastPoint >= 0 && t.indexOf('.') === lastPoint && t.length - lastPoint - 1 !== 3) decimal = '.';

  let whole = t;
  let fraction = '';
  if (decimal) {
    const i = t.lastIndexOf(decimal);
    whole = t.slice(0, i);
    fraction = t.slice(i + 1);
  }
  const thousands = decimal === ',' ? '.' : decimal === '.' ? ',' : null;
  const grouped = (part: string, sep: string) =>
    part.split(sep).every((g, i) => (i === 0 ? /^\d{1,3}$/.test(g) : /^\d{3}$/.test(g)));
  if (thousands) {
    if (whole.includes(thousands) && !grouped(whole, thousands)) return null; // grupos de miles mal formados
    whole = whole.split(thousands).join('');
  } else {
    const sep = t.includes('.') ? '.' : ',';
    if (t.includes(sep) && !grouped(t, sep)) return null; // p. ej. "1,2,3"
    whole = whole.replace(/[.,]/g, '');
  }
  if (!/^\d+$/.test(whole) || (decimal && !/^\d+$/.test(fraction))) return null;
  const n = Number(fraction ? `${whole}.${fraction}` : whole);
  return Number.isFinite(n) ? n : null;
}
