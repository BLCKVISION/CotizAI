import { request } from '@/core/api/client';

export type ProjectState = 'receiving' | 'evaluating' | 'committee_review' | 'awarded' | 'closed';
export type Project = {
  id: string;
  name: string;
  requirement: string;
  location: string;
  reference_budget: string | null;
  state: ProjectState;
  created: string;
  closing_reason: string | null;
};
export type NewProject = {
  name: string;
  requirement: string;
  location: string;
  reference_budget: number | null;
};

export const listProjectsApi = (token: string) => request<Project[]>('/projects', { token });
export const getProjectApi = (id: string) => (token: string) => request<Project>(`/projects/${id}`, { token });
export const createProjectApi = (data: NewProject) => (token: string) =>
  request<Project>('/projects', { method: 'POST', body: data, token });
