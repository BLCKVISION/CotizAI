// Pruebas de API de imágenes del catálogo y métricas por producto.  API=http://localhost:3000 node test/api-images.mjs
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
const API = process.env.API ?? 'http://localhost:3000';
let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${name}${c ? '' : '  ' + extra}`); };
const j = async (t, m, p, b) => { const r = await fetch(API + p, { method: m, headers: { ...(b ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); const x = await r.text(); let d; try { d = JSON.parse(x); } catch { d = x; } return { s: r.status, d }; };
const up = async (t, id, buf, name = 'foto.png', type = 'image/png') => { const f = new FormData(); f.append('file', new Blob([buf], { type }), name); const r = await fetch(`${API}/v1/products/${id}/image`, { method: 'POST', headers: t ? { authorization: 'Bearer ' + t } : {}, body: f }); const x = await r.text(); let d; try { d = JSON.parse(x); } catch { d = x; } return { s: r.status, d }; };
const uniq = Date.now();
const signup = async tag => (await j(null, 'POST', '/auth/register', { name: tag, email: `${tag}${uniq}@test.com`, password: 'Clave-segura-123', companyName: 'Img SA' })).d;
const A = await signup('imga'), B = await signup('imgb');
const ta = A.accessToken, tb = B.accessToken, uidA = A.user.id;
const prod = (await j(ta, 'POST', '/v1/products', { name: 'Camiseta test', sku: 'IMG-1', price: 10, cost: 4, trackStock: true, stock: 20, minStock: 2 })).d;

const png = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#3b82f6' } }).png().toBuffer();
const jpgExif = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#fb7185' } }).jpeg().withExif({ IFD0: { Copyright: 'SECRETO-EXIF', Software: 'espia' } }).toBuffer();

let r = await up(null, prod.id, png); ok(r.s === 401, 'subir sin sesión → 401', r.s);
r = await up(ta, prod.id, png); ok(r.s === 200 && /^\/media\/products\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(r.d.imageUrl) && r.d.thumbUrl === r.d.imageUrl.replace('.webp', '-thumb.webp'), 'subir PNG válido → imageUrl y thumbUrl', JSON.stringify(r.d).slice(0, 200));
const img1 = r.d.imageUrl, thumb1 = r.d.thumbUrl;
let g = await fetch(API + img1); const buf = Buffer.from(await g.arrayBuffer()); const meta = await sharp(buf).metadata();
ok(g.status === 200 && g.headers.get('content-type') === 'image/webp' && /immutable/.test(g.headers.get('cache-control')) && g.headers.get('x-content-type-options') === 'nosniff', 'GET imagen pública con cabeceras seguras');
ok(meta.format === 'webp' && meta.width === 1200 && meta.height === 900, 'se redimensiona a ≤1200 px y se convierte a WebP', `${meta.format} ${meta.width}x${meta.height}`);
const tm = await sharp(Buffer.from(await (await fetch(API + thumb1)).arrayBuffer())).metadata(); ok(tm.width === 480, 'miniatura de 480 px', String(tm.width));
r = await up(ta, prod.id, jpgExif, 'f.jpg', 'image/jpeg'); const out = Buffer.from(await (await fetch(API + r.d.imageUrl)).arrayBuffer());
ok(r.s === 200 && !out.includes('SECRETO-EXIF') && !(await sharp(out).metadata()).exif, 'se eliminan los metadatos EXIF');
ok((await fetch(API + img1)).status === 404 && (await fetch(API + thumb1)).status === 404, 'al reemplazar, la imagen anterior se borra del disco');
const img2 = r.d.imageUrl;

r = await up(ta, prod.id, Buffer.from('esto es texto, no una imagen'), 'x.png'); ok(r.s === 400, 'texto con extensión .png → 400', r.s);
r = await up(ta, prod.id, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="9" height="9"/></svg>'), 'x.svg', 'image/svg+xml'); ok(r.s === 400, 'SVG con script → 400 (formato no admitido)', r.s);
r = await up(ta, prod.id, await sharp({ create: { width: 20, height: 20, channels: 3, background: '#000' } }).gif().toBuffer(), 'x.gif', 'image/gif'); ok(r.s === 400, 'GIF → 400', r.s);
r = await up(ta, prod.id, png.subarray(0, 40), 'rota.png'); ok(r.s === 400, 'PNG corrupto → 400', r.s);
r = await up(ta, prod.id, Buffer.alloc(5.5 * 1024 * 1024, 7), 'grande.png'); ok(r.s === 413, 'más de 5 MB → 413', r.s);
r = await up(tb, prod.id, png); ok(r.s === 404, 'otro usuario no puede subir imagen a mi producto', r.s);
r = await j(tb, 'DELETE', `/v1/products/${prod.id}/image`); ok(r.s === 404, 'otro usuario no puede borrar mi imagen', r.s);
ok((await fetch(API + img2)).status === 200, 'la imagen sigue intacta tras los intentos fallidos');

for (const [path, tag] of [[`/media/products/${uidA}/..%2f..%2f.env`, 'traversal %2f'], [`/media/products/${uidA}/x.webp`, 'nombre no UUID'], [`/media/products/..%2f..%2fetc/passwd`, 'userId con ..'], [`/media/products/${uidA}/${img2.split('/').pop().replace('.webp', '.png')}`, 'extensión distinta'], [`/media/products/${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}/${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}.webp`, 'archivo inexistente']]) {
  const x = await fetch(API + path); ok(x.status === 404, `GET ${tag} → 404`, String(x.status));
}
r = await j(ta, 'POST', '/v1/products', { name: 'Con url externa', imageUrl: 'http://evil.example/x.png', price: 1 }); ok(r.s === 201 && (r.d.imageUrl === '' || r.d.imageUrl === null), 'imageUrl enviado por el cliente se ignora', JSON.stringify(r.d.imageUrl));
r = await j(ta, 'DELETE', `/v1/products/${prod.id}/image`); ok(r.s === 200 && r.d.imageUrl === '' && r.d.thumbUrl === '' && (await fetch(API + img2)).status === 404, 'borrar imagen la quita del producto y del disco');
r = await up(ta, prod.id, png); const img3 = r.d.imageUrl;
r = await j(ta, 'DELETE', `/v1/products/${prod.id}`); ok(r.s === 200 && (await fetch(API + img3)).status === 404, 'borrar el producto borra su imagen');

// ── Métricas por producto (ganancia y demanda)
const hot = (await j(ta, 'POST', '/v1/products', { name: 'Zapatillas Rayo', sku: 'Z-1', price: 50, cost: 30, trackStock: true, stock: 100, minStock: 5 })).d;
const cold = (await j(ta, 'POST', '/v1/products', { name: 'Bufanda Nube', sku: 'B-1', price: 20, cost: 8, trackStock: true, stock: 10, minStock: 2 })).d;
await j(ta, 'POST', `/v1/products/${hot.id}/stock`, { type: 'out', quantity: 6, reason: 'Venta · pedido #1' });
await j(ta, 'POST', `/v1/products/${hot.id}/stock`, { type: 'out', quantity: 4, reason: 'Merma por humedad' });
await j(ta, 'POST', `/v1/products/${cold.id}/stock`, { type: 'out', quantity: 1, reason: 'Venta' });
const c = (await j(ta, 'POST', '/v1/contacts', { name: 'Cliente Curioso', phone: '+58 412 000 0000' })).d;
const c2 = (await j(ta, 'POST', '/v1/contacts', { name: 'Otra Clienta', phone: '+58 414 000 0000' })).d;
for (const [cid, txt] of [[c.id, 'Hola, ¿tienen las zapatillas rayo en talla 40?'], [c2.id, 'Quiero ver las ZAPATILLAS RAYO']]) await j(ta, 'POST', `/v1/conversations/${cid}/incoming`, { text: txt });
const list = (await j(ta, 'GET', '/v1/products')).d, H = list.find(p => p.id === hot.id), C = list.find(p => p.id === cold.id);
ok(H.stats.unitsSold === 6 && H.stats.revenue === 300 && H.stats.profit === 120 && H.stats.marginPct === 40, 'ganancia = unidades vendidas × (precio − costo); la merma no cuenta', JSON.stringify(H.stats));
ok(H.stats.requests30d === 2, 'solicitudes: clientes distintos que lo mencionaron (sin importar tildes/mayúsculas)', String(H.stats.requests30d));
ok(H.stats.demand === 'high' && C.stats.demand !== 'high' && C.stats.unitsSold === 1 && C.stats.profit === 12, 'demanda relativa: el más pedido es "high" y el otro no', `${H.stats.demand} ${C.stats.demand}`);
const noSales = list.find(p => p.sku === 'IMG-1' || p.name === 'Con url externa'); ok(noSales.stats.demand === 'none' && noSales.stats.profit === 0, 'producto sin ventas ni consultas: demanda "none" y ganancia 0');
const other = (await j(tb, 'GET', '/v1/products')).d; ok(other.length === 0, 'las métricas y productos están aislados por cuenta');
console.log(`\nRESULTADO IMÁGENES: ${pass} PASS / ${fail} FAIL`); process.exit(fail ? 1 : 0);
