import { peticion, peticionBinaria } from '@/core/api/cliente';
import type { EstadoProyecto } from '@/features/proyectos/api';

export type Estadisticas = {
  total_proyectos: number;
  total_propuestas: number;
  total_proveedores: number;
  por_estado: Record<EstadoProyecto, number>;
  por_formato: Record<'pdf' | 'jpg' | 'png' | 'xlsx', number>;
  por_ubicacion: Record<string, number>;
  por_mes: Record<string, number>;
  presupuestos: Record<string, string>;
  propuestas_por_proyecto: Record<string, number>;
};
export type Propuesta = { id: string; archivo: string; formato: string; tamano: number; sha256: string; creado: string };
export type Nota = { id: string; texto: string; autor: string; creado: string };
export type Evento = { id: string; accion: string; detalle: string; actor: string; creado: string; secuencia: number; huella: string };
export type Auditoria = { integra: boolean; total: number; eventos: Evento[] };
export type Proveedor = { id: string; nombre: string; rif: string; ubicacion: string; contacto: string; creado: string };
export type NuevoProveedor = Omit<Proveedor, 'id' | 'creado'>;

export const estadisticasApi = (token: string) => peticion<Estadisticas>('/estadisticas', { token });
export const auditoriaApi = (token: string) => peticion<Auditoria>('/auditoria', { token });
export const proveedoresApi = (token: string) => peticion<Proveedor[]>('/proveedores', { token });
export const registrarProveedorApi = (datos: NuevoProveedor) => (token: string) =>
  peticion<Proveedor>('/proveedores', { metodo: 'POST', cuerpo: datos, token });

const base = (id: string) => `/proyectos/${id}`;
export const propuestasApi = (id: string) => (token: string) => peticion<Propuesta[]>(`${base(id)}/propuestas`, { token });
export const cargarPropuestaApi = (id: string, nombre: string, contenido: Blob) => async (token: string) => {
  await peticionBinaria(`${base(id)}/propuestas?archivo=${encodeURIComponent(nombre)}`, token, contenido);
};
export const descargarPropuestaApi = (id: string, propuestaId: string) => async (token: string) =>
  (await peticionBinaria(`${base(id)}/propuestas/${propuestaId}/archivo`, token)).blob();
export type ProposalMarkdown = { filename: string; markdown: string; engine: string; notices: string[] };
/** OCR of a photo or a scanned page can take a while. */
export const proposalMarkdownApi = (projectId: string, proposalId: string) => (token: string) =>
  peticion<ProposalMarkdown>(`${base(projectId)}/propuestas/${proposalId}/markdown`, { token, timeoutMs: 150_000 });
export const eliminarPropuestaApi = (id: string, propuestaId: string) => (token: string) =>
  peticion<void>(`${base(id)}/propuestas/${propuestaId}`, { metodo: 'DELETE', token });
export const notasApi = (id: string) => (token: string) => peticion<Nota[]>(`${base(id)}/notas`, { token });
export const anotarApi = (id: string, texto: string) => (token: string) =>
  peticion<Nota>(`${base(id)}/notas`, { metodo: 'POST', cuerpo: { texto }, token });
export const historialApi = (id: string) => (token: string) => peticion<Evento[]>(`${base(id)}/historial`, { token });

export const ACCIONES: Record<string, string> = {
  proyecto_creado: 'Creó un proyecto',
  proyecto_transicion: 'Cambió el estado de un proyecto',
  propuesta_cargada: 'Cargó una propuesta',
  propuesta_descargada: 'Descargó una propuesta',
  propuesta_eliminada: 'Eliminó una propuesta',
  proyecto_eliminado: 'Eliminó un proyecto',
  nota_agregada: 'Agregó una nota de revisión',
  proveedor_registrado: 'Registró un proveedor',
  login_exitoso: 'Inició sesión',
  login_fallido: 'Intento de inicio de sesión fallido',
  logout: 'Cerró sesión',
  evaluation_completed: 'Evaluó las propuestas de un proyecto',
  tasa_registrada: 'Registró una tasa de cambio manual',
  project_question_asked: 'Consultó sobre un proyecto evaluado',
};
export const etiquetaDeAccion = (a: string) => ACCIONES[a] ?? a.replace(/_/g, ' ');
