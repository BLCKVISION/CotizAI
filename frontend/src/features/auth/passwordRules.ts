// Dependency-free on purpose so it runs in the plain-Node unit tests.
export const MIN_PASSWORD_LENGTH = 10;

export type PasswordRule = { id: string; label: string; passes: boolean };

/** Rules shown while the person types. The server must enforce them again. */
export function checkPassword(password: string, email: string): PasswordRule[] {
  const user = email.split('@')[0].trim().toLowerCase();
  return [
    { id: 'length', label: `Al menos ${MIN_PASSWORD_LENGTH} caracteres`, passes: password.length >= MIN_PASSWORD_LENGTH },
    { id: 'case', label: 'Mayúsculas y minúsculas', passes: /\p{Lu}/u.test(password) && /\p{Ll}/u.test(password) },
    { id: 'number', label: 'Al menos un número', passes: /\d/.test(password) },
    { id: 'symbol', label: 'Al menos un símbolo (por ejemplo ! # $ %)', passes: /[^\p{L}\p{N}\s]/u.test(password) },
    { id: 'personal', label: 'No contiene su correo', passes: password.length > 0 && (user.length < 3 || !password.toLowerCase().includes(user)) },
  ];
}

export const isStrongPassword = (password: string, email: string) => checkPassword(password, email).every((r) => r.passes);
export const isEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
