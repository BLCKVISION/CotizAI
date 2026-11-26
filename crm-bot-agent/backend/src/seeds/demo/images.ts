import { DataSource } from 'typeorm';
import sharp from 'sharp';
import { Product } from '../../crm/entities.js';
import { storeProductImage } from '../../media/product-images.js';
import { renderArt } from './product-art.js';
import type { Profile } from './types.js';

/** Pone una imagen ilustrada a los productos de demostración que aún no tienen (no pisa las que subió el usuario). */
export async function seedDemoImages(ds: DataSource, userId: string, prof: Profile) {
  const repo = ds.getRepository(Product);
  let n = 0;
  for (const [i, s] of prof.products.entries()) {
    const p = await repo.findOneBy({ userId, sku: s.sku });
    if (!p || p.imageUrl) continue;
    p.imageUrl = await storeProductImage(userId, await sharp(Buffer.from(renderArt(s.sku, i))).png().toBuffer());
    await repo.save(p);
    n++;
  }
  return n;
}
