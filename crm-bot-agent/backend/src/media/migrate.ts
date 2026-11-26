/**
 * Copia las imágenes que están en disco (volumen antiguo) a MinIO, conservando las mismas rutas:
 * no hace falta tocar la base de datos. Idempotente.   node dist/media/migrate.js
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { storage, uploadRoot } from './storage.js';

if (!process.env['MINIO_ENDPOINT']) { console.error('Define MINIO_ENDPOINT para migrar a MinIO'); process.exit(1); }
const dest = storage();
const base = join(uploadRoot(), 'products');
let copied = 0, skipped = 0;
for (const uid of await readdir(base).catch(() => [])) {
  for (const f of await readdir(join(base, uid))) {
    const key = `products/${uid}/${f}`;
    if (!f.endsWith('.webp')) continue;
    if (await dest.exists(key)) { skipped++; continue; }
    await dest.put(key, await readFile(join(base, uid, f)));
    copied++;
  }
}
console.log(`Imágenes copiadas a MinIO: ${copied} (ya estaban: ${skipped})`);
process.exit(0);
