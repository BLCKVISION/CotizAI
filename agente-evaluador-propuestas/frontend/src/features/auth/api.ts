import { request } from '@/core/api/client';

export type Role = 'loader' | 'evaluator' | 'approver' | 'auditor';
export type User = { id: string; email: string; role: Role; organization_id: string };
export type SessionResponse = { access_token: string; token_type: string; expires: string; user: User };

export const startSessionApi = (email: string, password: string) =>
  request<SessionResponse>('/sessions', { method: 'POST', body: { email, password } });

export const closeSessionApi = (token: string) => request<void>('/sessions/current', { method: 'DELETE', token });
export const currentUserApi = (token: string) => request<User>('/users/current', { token });
