import { environment } from '../../environments/environment';

/**
 * Las imágenes de producto las sirve el propio backend (mismo origen, vía /api) con rutas relativas
 * `/media/products/<usuario>/<id>.webp`. La CSP solo permite img-src 'self' y data:, así que se ignora
 * cualquier URL externa y se antepone el prefijo de la API a las rutas propias.
 */
export function mediaUrl(path?: string | null): string {
  return path && /^\/media\/products\/[\w-]+\/[\w-]+(-thumb)?\.webp$/.test(path) ? `${environment.apiUrl}${path}` : '';
}

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Comprueba los primeros bytes (JPEG, PNG o WebP): no basta con fiarse del tipo MIME que declara el navegador. */
export async function sniffImage(file: File): Promise<boolean> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const webp = b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return jpeg || png || webp;
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
