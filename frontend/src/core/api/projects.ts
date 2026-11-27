import { peticion } from './cliente';

export type EstadoProyecto = 'en_recepcion' | 'en_evaluacion' | 'en_revision_del_comite' | 'adjudicado' | 'cerrado';
export type Proyecto = {
  id: string;
  nombre: string;
  requerimiento: string;
  ubicacion: string;
  presupuesto_referencial: string | null;
  estado: EstadoProyecto;
  creado: string;
  motivo_de_cierre: string | null;
  moneda: Moneda;
};
export type Moneda = 'USD' | 'VES';
export type NuevoProyecto = {
  moneda: Moneda;
  nombre: string;
  requerimiento: string;
  ubicacion: string;
  presupuesto_referencial: number | null;
};

export const listarProyectosApi = (token: string) => peticion<Proyecto[]>('/proyectos', { token });
export const deleteProjectApi = (id: string) => (token: string) => peticion<void>(`/proyectos/${id}`, { metodo: 'DELETE', token });
export const obtenerProyectoApi = (id: string) => (token: string) => peticion<Proyecto>(`/proyectos/${id}`, { token });
export const crearProyectoApi = (datos: NuevoProyecto) => (token: string) =>
  peticion<Proyecto>('/proyectos', { metodo: 'POST', cuerpo: datos, token });
export const transicionarProyectoApi = (id: string, destino: EstadoProyecto, motivo: string | null) => (token: string) =>
  peticion<Proyecto>(`/proyectos/${id}/transiciones`, { metodo: 'POST', cuerpo: { destino, motivo }, token });
