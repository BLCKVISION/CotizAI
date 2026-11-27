import { peticion } from '@/core/api/cliente';
import type { Role } from '@/core/auth/permissions';

export type Member = { id: string; email: string; display_name: string; role: Role; active: boolean; is_you: boolean };
export type Team = { can_manage: boolean; members: Member[]; roles: { role: Role; permissions: string[] }[] };
export type NewMember = { display_name: string; email: string; password: string; role: Role };

export const teamApi = (token: string) => peticion<Team>('/team', { token });
export const addMemberApi = (member: NewMember) => (token: string) => peticion<Member>('/team', { metodo: 'POST', cuerpo: member, token });
export const changeMemberApi = (id: string, change: { role?: Role; active?: boolean }) => (token: string) =>
  peticion<Member>(`/team/${id}`, { metodo: 'POST', cuerpo: change, token });
