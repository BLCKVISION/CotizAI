/** Typed client for project evaluations, exchange rates, reports and questions. */
import { peticion, peticionBinaria } from './cliente';

import type { Verdict } from '../evaluationFormat';

/** Reading and judging up to 20 documents takes minutes, far beyond the default request timeout. */
const EVALUATION_TIMEOUT_MS = 300_000;
const QUESTION_TIMEOUT_MS = 90_000;
/** The server may wait for the BCV before answering. */
const RATES_TIMEOUT_MS = 30_000;

export type ProposalFinding = {
  code: string;
  severity: string;
  discards: boolean;
  reason: string;
  evidence: string;
  origin: string;
};

export type CostStep = { concept: string; amount: string | null; detail: string };
export type TraceStep = { step: string; title: string; status: 'ok' | 'alert' | 'info'; detail: string[] };
export type Criterion = { criterion: string; score: number; weight: number; evidence: string[] };

export type ProposalEvaluationItem = {
  proposal_id: string;
  filename: string;
  verdict: Verdict;
  score: string | null;
  real_cost: string | null;
  currency: string | null;
  converted_cost: string | null;
  converted_currency: string | null;
  findings: ProposalFinding[];
  supplier: string | null;
  cost_steps: CostStep[];
  criteria: Criterion[];
  reading_warnings: string[];
  over_budget: boolean;
  supplier_history: string[];
  /** What the agent really did, step by step. Absent in results saved before it existed. */
  trace?: TraceStep[];
  /** Control questions without enough data. Absent in results saved before it existed. */
  unverified?: string[];
};

export type ExchangeRate = {
  base: string;
  quote: string;
  value: string;
  source: string;
  effective_date: string;
  origin: string;
};

export type ProjectEvaluation = {
  project_id: string;
  evaluated_at: string;
  target_currency: string;
  evaluated_count: number;
  /** True when this role may start an evaluation but not read its results. */
  restricted: boolean;
  /** Items arrive already sorted by ranking. */
  ranking: string[];
  items: ProposalEvaluationItem[];
  exchange_rates: ExchangeRate[];
  warnings: string[];
};

export type ManualRate = { base: string; quote: string; value: string; source: string; effective_date: string };
export type Answer = { answer: string; citations: { number: number; filename: string; excerpt: string }[] };
export type ReportFormat = 'pdf' | 'csv' | 'xlsx' | 'md';

const evaluationsPath = (projectId: string) => `/proyectos/${projectId}/evaluations`;

/** Without `proposalIds` every proposal is evaluated; with them, only those (the rest keep their result). */
export const evaluateProjectApi = (projectId: string, proposalIds?: string[]) => (token: string) =>
  peticion<ProjectEvaluation>(evaluationsPath(projectId), {
    metodo: 'POST',
    cuerpo: proposalIds ? { proposal_ids: proposalIds } : undefined,
    token,
    timeoutMs: EVALUATION_TIMEOUT_MS,
  });

export const getEvaluationApi = (projectId: string) => (token: string) =>
  peticion<ProjectEvaluation>(evaluationsPath(projectId), { token });

export const getExchangeRatesApi = (token: string) =>
  peticion<ExchangeRate[]>('/exchange-rates', { token, timeoutMs: RATES_TIMEOUT_MS });

export const registerManualRateApi = (rate: ManualRate) => (token: string) =>
  peticion<ExchangeRate>('/exchange-rates', { metodo: 'POST', cuerpo: rate, token });

export const downloadReportApi = (projectId: string, format: ReportFormat) => async (token: string) =>
  (await peticionBinaria(`${evaluationsPath(projectId)}/report?fmt=${format}`, token)).blob();

export const askProjectApi = (projectId: string, question: string) => (token: string) =>
  peticion<Answer>(`/proyectos/${projectId}/ask`, {
    metodo: 'POST',
    cuerpo: { question },
    token,
    timeoutMs: QUESTION_TIMEOUT_MS,
  });

/** A person's yes or no on the AI's result for one proposal. */
export type ReviewDecision = { proposal_id: string; approved: boolean; comment: string; decided_by: string; decided_at: string };

export const getReviewsApi = (projectId: string) => (token: string) => peticion<ReviewDecision[]>(`/proyectos/${projectId}/reviews`, { token });
export const sendReviewApi = (projectId: string, proposalId: string, approved: boolean, comment: string) => (token: string) =>
  peticion<ReviewDecision>(`/proyectos/${projectId}/reviews`, { metodo: 'POST', cuerpo: { proposal_id: proposalId, approved, comment }, token });

/** Coti outside a project: questions about every project of the organisation. */
export const askPortfolioApi = (question: string) => (token: string) =>
  peticion<{ answer: string }>('/portfolio/questions', {
    metodo: 'POST',
    cuerpo: { question },
    token,
    timeoutMs: QUESTION_TIMEOUT_MS,
  });
