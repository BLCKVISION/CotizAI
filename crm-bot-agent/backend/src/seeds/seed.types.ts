export interface UserSeed {
  /** Identificador corto; también sirve para las variables SEED_EMAIL_<USERNAME> / SEED_PASSWORD_<USERNAME>. */
  username: string;
  name: string;
  companyName: string;
  /** Email por defecto (el login es por email); se puede sobrescribir con SEED_EMAIL_<USERNAME>. */
  email: string;
  /** Perfil de datos de demostración que se carga con --demo (ver seeds/demo). */
  demo?: 'moda' | 'dental';
}
