// Dependency-free on purpose so it runs in the plain-Node unit tests.
/** Mirror of the backend's permission matrix. It only decides what to show: the server is the authority. */
export type Role = 'cargador' | 'evaluador' | 'aprobador' | 'auditor' | 'coordinador';
export type Permission = 'createProject' | 'upload' | 'evaluate' | 'seeResults' | 'review' | 'award' | 'audit' | 'registerRate' | 'manageTeam';

const GRANTS: Record<Role, readonly Permission[]> = {
  cargador: ['createProject', 'upload', 'evaluate'],
  evaluador: ['evaluate', 'seeResults', 'review', 'registerRate'],
  aprobador: ['seeResults', 'review', 'award'],
  auditor: ['seeResults', 'audit'],
  coordinador: ['createProject', 'upload', 'evaluate', 'seeResults', 'review', 'registerRate', 'manageTeam'],
};

export const can = (role: Role | null | undefined, permission: Permission) => (role ? GRANTS[role].includes(permission) : false);
