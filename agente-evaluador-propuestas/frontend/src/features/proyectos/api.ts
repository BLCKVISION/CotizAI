import { peticion } from '@/core/api/cliente';

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
};
export type NuevoProyecto = {
  nombre: string;
  requerimiento: string;
  ubicacion: string;
  presupuesto_referencial: number | null;
};

export const listarProyectosApi = (token: string) => peticion<Proyecto[]>('/proyectos', { token });
export const obtenerProyectoApi = (id: string) => (token: string) => peticion<Proyecto>(`/proyectos/${id}`, { token });
export const crearProyectoApi = (datos: NuevoProyecto) => (token: string) =>
  peticion<Proyecto>('/proyectos', { metodo: 'POST', cuerpo: datos, token });
