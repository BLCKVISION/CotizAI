/**
 * Interpreta un monto escrito por una persona, con formato es-VE ("1.500,50") o simple ("1500.5").
 * Devuelve null si no es un número finito válido. Reglas:
 * - Solo dígitos, espacios, '.' y ','.
 * - Si hay ambos, el último separador es el decimal y el otro es de miles.
 * - Un solo separador repetido es de miles ("1.500.000").
 * - Un solo separador una vez: ',' es decimal; '.' es de miles solo si le siguen exactamente 3 dígitos ("1.500").
 */
export function parsearMonto(texto: string): number | null {
  const t = texto.trim().replace(/\s+/g, '');
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const ultimaComa = t.lastIndexOf(',');
  const ultimoPunto = t.lastIndexOf('.');
  let decimal: string | null = null;
  if (ultimaComa >= 0 && ultimoPunto >= 0) decimal = ultimaComa > ultimoPunto ? ',' : '.';
  else if (ultimaComa >= 0 && t.indexOf(',') === ultimaComa) decimal = ',';
  else if (ultimoPunto >= 0 && t.indexOf('.') === ultimoPunto && t.length - ultimoPunto - 1 !== 3) decimal = '.';

  let entera = t;
  let fraccion = '';
  if (decimal) {
    const i = t.lastIndexOf(decimal);
    entera = t.slice(0, i);
    fraccion = t.slice(i + 1);
  }
  const miles = decimal === ',' ? '.' : decimal === '.' ? ',' : null;
  const agrupada = (parte: string, sep: string) =>
    parte.split(sep).every((g, i) => (i === 0 ? /^\d{1,3}$/.test(g) : /^\d{3}$/.test(g)));
  if (miles) {
    if (entera.includes(miles) && !agrupada(entera, miles)) return null; // grupos de miles mal formados
    entera = entera.split(miles).join('');
  } else {
    const sep = t.includes('.') ? '.' : ',';
    if (t.includes(sep) && !agrupada(t, sep)) return null; // p. ej. "1,2,3"
    entera = entera.replace(/[.,]/g, '');
  }
  if (!/^\d+$/.test(entera) || (decimal && !/^\d+$/.test(fraccion))) return null;
  const n = Number(fraccion ? `${entera}.${fraccion}` : entera);
  return Number.isFinite(n) ? n : null;
}
