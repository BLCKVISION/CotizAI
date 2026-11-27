import { peticion } from '@/core/api/cliente';

export type Rol = 'cargador' | 'evaluador' | 'aprobador' | 'auditor';
export type Usuario = { id: string; correo: string; rol: Rol; organizacion_id: string; display_name?: string };
export type SesionRespuesta = { token_acceso: string; tipo_token: string; expira: string; usuario: Usuario };

export const iniciarSesionApi = (correo: string, contrasena: string) =>
  peticion<SesionRespuesta>('/sesiones', { metodo: 'POST', cuerpo: { correo, contrasena } });

export const cerrarSesionApi = (token: string) => peticion<void>('/sesiones/actual', { metodo: 'DELETE', token });
export const usuarioActualApi = (token: string) => peticion<Usuario>('/usuarios/actual', { token });

/** Account routes the backend has to provide. Until then they answer 404 and the screen says so. */
export const registerAccountApi = (displayName: string, email: string, password: string) =>
  peticion<void>('/registrations', { metodo: 'POST', cuerpo: { display_name: displayName, email, password } });
export const requestPasswordResetApi = (email: string) => peticion<void>('/password-resets', { metodo: 'POST', cuerpo: { email } });
/** Full URL where the server starts the Google sign-in. Empty while it is not configured. */
export const GOOGLE_AUTH_URL = process.env.EXPO_PUBLIC_GOOGLE_AUTH_URL ?? '';
