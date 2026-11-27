// Dependency-free on purpose so it runs in the plain-Node unit tests.
export type Participation = {
  project_id: string;
  project_name: string;
  filename: string;
  verdict: string;
  position: number;
  competitors: number;
  cost: string | null;
  currency: string | null;
  evaluated_at: string;
  causes: { code: string; reason: string }[];
};

export type SupplierEntry = {
  key: string;
  name: string;
  registration: { id: string; tax_id: string; location: string; contact: string } | null;
  participations: Participation[];
  alerts: { code: string; times: number }[];
};

export type SupplierDirectory = { restricted: boolean; suppliers: SupplierEntry[] };

const ALERTS: Record<string, string> = {
  ALCANCE: 'Alcance incompleto',
  COMPAT: 'Incompatibilidad técnica',
  CAPACIDAD: 'Capacidad insuficiente',
  CALIDAD: 'Equipos obsoletos o de baja calidad',
  ABUSIVO: 'Sobrecosto o condiciones abusivas',
  ARITMETICA: 'Errores de cálculo',
  MANIPULACION: 'Intento de manipular la evaluación',
};

export const alertText = (alert: { code: string; times: number }) =>
  `${ALERTS[alert.code] ?? alert.code}${alert.times > 1 ? ` (${alert.times} veces)` : ''}`;

export const timesDiscarded = (supplier: SupplierEntry) => supplier.participations.filter((p) => p.verdict === 'descartada').length;

/** One short line for the card: the alert comes first, because it is what changes a decision. */
export function backgroundLabel(supplier: SupplierEntry): { tone: 'aviso' | 'info' | 'neutro'; text: string } {
  if (supplier.alerts.some((a) => a.code === 'MANIPULACION')) return { tone: 'aviso', text: 'Intentó manipular la evaluación' };
  const discarded = timesDiscarded(supplier);
  if (discarded > 0) return { tone: 'aviso', text: discarded === 1 ? 'Descartado 1 vez' : `Descartado ${discarded} veces` };
  const total = supplier.participations.length;
  if (total > 0) return { tone: 'info', text: total === 1 ? '1 participación' : `${total} participaciones` };
  return { tone: 'neutro', text: 'Sin participaciones' };
}

export function matchesSearch(supplier: SupplierEntry, query: string): boolean {
  const text = `${supplier.name} ${supplier.registration?.tax_id ?? ''} ${supplier.registration?.location ?? ''}`;
  return text.toLowerCase().includes(query.trim().toLowerCase());
}
