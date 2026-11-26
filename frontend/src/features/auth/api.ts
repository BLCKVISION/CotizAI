import { peticion } from '@/core/api/cliente';

export type Rol = 'cargador' | 'evaluador' | 'aprobador' | 'auditor';
export type Usuario = { id: string; correo: string; rol: Rol; organizacion_id: string; display_name?: string };
export type SesionRespuesta = { token_acceso: string; tipo_token: string; expira: string; usuario: Usuario };

export const iniciarSesionApi = (correo: string, contrasena: string) =>
  peticion<SesionRespuesta>('/sesiones', { metodo: 'POST', cuerpo: { correo, contrasena } });

export const cerrarSesionApi = (token: string) => peticion<void>('/sesiones/actual', { metodo: 'DELETE', token });
export const usuarioActualApi = (token: string) => peticion<Usuario>('/usuarios/actual', { token });
