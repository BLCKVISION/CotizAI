import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ValueTransformer } from 'typeorm';

const PREFIX = 'enc:v1:';

/** Clave de 32 bytes: DATA_KEY si existe; si no, se deriva del JWT_SECRET. */
function key() {
  const raw = process.env['DATA_KEY'] ?? process.env['JWT_SECRET'];
  if (!raw) throw new Error('Falta DATA_KEY o JWT_SECRET para cifrar secretos');
  return createHash('sha256').update(raw).digest();
}

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), data]).toString('base64');
}

/** Acepta valores antiguos sin cifrar (sin prefijo) para no romper datos previos. */
export function decrypt(stored: string) {
  if (!stored.startsWith(PREFIX)) return stored;
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const d = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

/** Transformer de TypeORM: el valor va cifrado en la base de datos. */
export const encryptedColumn: ValueTransformer = {
  to: (v: string | null | undefined) => (v ? encrypt(v) : v),
  from: (v: string | null | undefined) => (v ? decrypt(v) : v),
};
