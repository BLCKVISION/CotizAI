import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function isPrivate(ip: string) {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) {
      const rest = v.slice(7);
      if (rest.includes('.')) return isPrivate(rest);
      // URL normaliza ::ffff:127.0.0.1 a ::ffff:7f00:1 (dos grupos hexadecimales = 4 bytes IPv4).
      const [hi, lo] = rest.split(':').map(h => parseInt(h, 16));
      if (hi === undefined || lo === undefined || Number.isNaN(hi) || Number.isNaN(lo)) return true;
      return isPrivate(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * Evita SSRF en los webhooks salientes: solo http(s) hacia IPs públicas.
 * ALLOW_PRIVATE_WEBHOOKS=true lo desactiva (solo para desarrollo/pruebas locales).
 */
export async function assertPublicUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new BadRequestException('URL inválida'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new BadRequestException('Solo se permiten URLs http(s)');
  if (process.env['ALLOW_PRIVATE_WEBHOOKS'] === 'true') return;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map(a => a.address);
  if (!ips.length) throw new BadRequestException('No se pudo resolver el host de la URL');
  if (ips.some(isPrivate)) throw new BadRequestException('La URL apunta a una red privada o interna');
}
