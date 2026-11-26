/**
 * Contrato de `GET /evaluations/{id}` (sección 3 de la arquitectura). Los montos viajan como texto (Decimal) y
 * solo se convierten a número para mostrarlos: la pantalla nunca calcula ni decide, solo presenta.
 * Sin imports: lo usan la lógica pura y sus pruebas.
 */
export type Verdict = 'valid' | 'discarded' | 'pending_review';
export type FindingCode = 'ALCANCE' | 'COMPAT' | 'CAPACIDAD' | 'CALIDAD' | 'ABUSIVO' | 'ARITMETICA' | 'MANIPULACION' | 'LECTURA';
export type Origin = 'rule' | 'ai' | 'person';

export type Finding = {
  code: FindingCode;
  severity: 'info' | 'warning' | 'critical';
  discards: boolean;
  reason: string;
  evidence: string;
  origin: Origin;
};

export type Amount = { literal: string; value: string };
export type Evidence = { page_or_cell: string; text: string };

export type EvaluatedLine = {
  description: string;
  category: string;
  quantity: Amount | null; // null = «no consta»
  unit_price: Amount | null;
  line_total: Amount | null;
  evidence: Evidence;
};

export type CostStep = { item: string; amount: string | null; detail: string }; // monto null = no determinado
export type Criterion = { score: number; evidence: string[] };

export type EvaluatedProposal = {
  id: string; // nombre del archivo sin extensión
  supplier: string | null;
  verdict: Verdict;
  score: string | null; // solo las válidas
  currency: string | null;
  criteria: { performance: Criterion; protection_and_peripherals: Criterion; warranty_and_support: Criterion } | null;
  cost: { total: string | null; steps: CostStep[] }; // total null = indeterminado
  findings: Finding[];
  lines: EvaluatedLine[];
};

export type Result = {
  id: string;
  project_id: string;
  generated: string; // ISO 8601
  delta: string; // puntos dentro de los cuales hay equivalencia técnica (desempata el costo real)
  ranking: string[]; // ids: válidas por puntaje, luego pendientes, luego descartadas
  proposals: EvaluatedProposal[];
};
