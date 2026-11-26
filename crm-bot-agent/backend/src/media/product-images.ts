import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { storage } from './storage.js';
export { uploadRoot } from './storage.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['jpeg', 'png', 'webp']);
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FILE_RE = new RegExp(`^${UUID}(-thumb)?\\.webp$`);
const UID_RE = new RegExp(`^${UUID}$`);
const URL_RE = new RegExp(`^/media/products/(${UUID})/(${UUID})\\.webp$`);
const LIMITS = { limitInputPixels: 40_000_000, failOn: 'error' as const };

/**
 * Valida y re-codifica la imagen: solo JPEG/PNG/WebP reales (se mira el contenido, no la extensión),
 * se corrige la orientación, se quitan los metadatos (EXIF/GPS) y se reduce a WebP. Re-codificar elimina
 * cualquier carga oculta dentro del archivo original.
 */
export async function encodeProductImage(input: Buffer) {
  let format: string | undefined;
  try { format = (await sharp(input, LIMITS).metadata()).format; } catch { throw new BadRequestException('La imagen no es válida o está dañada'); }
  if (!format || !ALLOWED.has(format)) throw new BadRequestException('Formato no admitido: usa JPEG, PNG o WebP');
  try {
    const base = sharp(input, LIMITS).rotate();
    const [full, thumb] = await Promise.all([
      base.clone().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(),
      base.clone().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
    ]);
    return { full, thumb };
  } catch { throw new BadRequestException('No se pudo procesar la imagen'); }
}

/** Guarda la imagen y su miniatura en el almacenamiento (MinIO o disco); devuelve la ruta relativa que se guarda en el producto. */
export async function storeProductImage(userId: string, input: Buffer) {
  const { full, thumb } = await encodeProductImage(input);
  const id = randomUUID();
  await Promise.all([storage().put(`products/${userId}/${id}.webp`, full), storage().put(`products/${userId}/${id}-thumb.webp`, thumb)]);
  return `/media/products/${userId}/${id}.webp`;
}

/** Borra una imagen propia (solo rutas con la forma esperada y del mismo usuario). */
export async function removeProductImage(url: string | null | undefined, userId: string) {
  const m = URL_RE.exec(url ?? '');
  if (!m || m[1] !== userId) return;
  await Promise.all([storage().remove(`products/${userId}/${m[2]}.webp`), storage().remove(`products/${userId}/${m[2]}-thumb.webp`)]);
}

export const thumbOf = (url: string | null | undefined) => (url ? url.replace(/\.webp$/, '-thumb.webp') : '');

/** Lee un archivo servible. Solo nombres UUID que generamos nosotros (evita path traversal); null si no es válido o no existe. */
export async function readMedia(userId: string, file: string) {
  if (!UID_RE.test(userId) || !FILE_RE.test(file)) return null;
  return storage().get(`products/${userId}/${file}`);
}
