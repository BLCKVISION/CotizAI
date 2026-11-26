import { request } from '@/core/api/client';

import type { Result } from './types';

export type * from './types';

export const getResultApi = (evaluationId: string) => (token: string) =>
  request<Result>(`/evaluaciones/${evaluationId}`, { token });
