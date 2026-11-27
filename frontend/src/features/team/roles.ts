// Dependency-free on purpose so it runs in the plain-Node unit tests.
import type { Role } from '../../core/auth/permissions';

export const ROLE_INFO: Record<Role, { label: string; summary: string }> = {
  coordinador: { label: 'Coordinador', summary: 'Lleva la compra de principio a fin y administra el equipo. No adjudica.' },
  cargador: { label: 'Cargador', summary: 'Crea proyectos, sube las propuestas e inicia la evaluación.' },
  evaluador: { label: 'Evaluador', summary: 'Revisa el análisis técnico y financiero, anota y confirma.' },
  aprobador: { label: 'Aprobador', summary: 'Aprueba la decisión final: adjudica o cierra el proceso.' },
  auditor: { label: 'Auditor', summary: 'Solo lectura: consulta los resultados y la auditoría.' },
};

/** In the order of a purchase: load, review, approve, audit. */
export const ROLE_ORDER: Role[] = ['cargador', 'evaluador', 'aprobador', 'auditor', 'coordinador'];

const PERMISSIONS: Record<string, string> = {
  crear_proyecto: 'Crear proyectos',
  cargar_documentos: 'Subir propuestas',
  iniciar_evaluacion: 'Iniciar evaluaciones',
  ver_estado: 'Ver el estado',
  ver_resultados: 'Ver resultados',
  anotar_revision: 'Revisar y anotar',
  adjudicar_o_cerrar: 'Adjudicar o cerrar',
  ver_auditoria: 'Ver la auditoría',
  registrar_tasa: 'Registrar tasas de cambio',
  manage_team: 'Administrar el equipo',
};

export const permissionLabel = (permission: string) => PERMISSIONS[permission] ?? permission.replace(/_/g, ' ');
