import { peticion, peticionBinaria } from './cliente';

import type { SupplierDirectory } from '../suppliers';

export type EvaluationRun = {
  id: string;
  evaluated_at: string;
  evaluated_by: string;
  proposals: number;
  valid: number;
  recommended: string | null;
};

export const supplierDirectoryApi = (token: string) => peticion<SupplierDirectory>('/suppliers/history', { token });

const runsPath = (projectId: string) => `/proyectos/${projectId}/evaluation-runs`;
export const evaluationRunsApi = (projectId: string) => (token: string) => peticion<EvaluationRun[]>(runsPath(projectId), { token });
export const runReportApi = (projectId: string, runId: string, format: 'pdf' | 'csv' | 'xlsx') => async (token: string) =>
  (await peticionBinaria(`${runsPath(projectId)}/${runId}/report?fmt=${format}`, token)).blob();
