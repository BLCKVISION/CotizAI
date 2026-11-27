// Dependency-free on purpose so it runs in the plain-Node unit tests.
export type Verdict = 'valida' | 'descartada' | 'pendiente_de_revision';

export const FINDING_LABELS: Record<string, string> = {
  ALCANCE: 'Alcance',
  COMPAT: 'Compatibilidad',
  CAPACIDAD: 'Capacidad',
  CALIDAD: 'Calidad',
  ABUSIVO: 'Precio o cláusula abusiva',
  ARITMETICA: 'Aritmética',
  MANIPULACION: 'Manipulación',
  LECTURA: 'Lectura',
};

export const CRITERION_LABELS: Record<string, string> = {
  rendimiento: 'Rendimiento',
  proteccion_y_perifericos: 'Protección y periféricos',
  garantia_y_soporte: 'Garantía y soporte',
};

export function formatMoney(amount: string | null, currency: string | null): string {
  if (amount === null) return 'No determinado';
  const value = Number(amount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const symbol = currency === 'VES' ? 'Bs.' : (currency ?? '');
  return `${symbol} ${value}`.trim();
}

/** Today in the user's own time zone. `toISOString` would already be tomorrow in Venezuela after 8 p. m. */
export function localDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Accepts «926,36», «1.016,86» or «926.36»; returns the API form, or null when it is not a positive number. */
export function parseRate(input: string): string | null {
  const text = input.trim();
  const normalised = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  return /^\d{1,12}(\.\d{1,6})?$/.test(normalised) && Number(normalised) > 0 ? normalised : null;
}

/** Share of the largest comparable cost, for the comparison bars. Null when there is nothing comparable. */
export function costShare(cost: string | null, costs: (string | null)[]): number | null {
  const largest = Math.max(0, ...costs.filter((c): c is string => c !== null).map(Number));
  return cost === null || largest <= 0 ? null : Number(cost) / largest;
}
