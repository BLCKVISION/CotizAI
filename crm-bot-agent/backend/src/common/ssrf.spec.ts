import { afterEach, describe, expect, it } from 'vitest';
import { assertPublicUrl } from './ssrf.js';

afterEach(() => { delete process.env['ALLOW_PRIVATE_WEBHOOKS']; });

describe('assertPublicUrl', () => {
  it.each(['ftp://example.com/x', 'file:///etc/passwd', 'javascript:alert(1)', 'no es url'])('rechaza %s', async u => {
    await expect(assertPublicUrl(u)).rejects.toThrow();
  });

  it.each(['http://127.0.0.1/x', 'http://localhost/x', 'http://10.0.0.5/x', 'http://192.168.1.10/x', 'http://172.16.0.1/x', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/x', 'http://[::ffff:127.0.0.1]/x', 'http://100.64.0.1/x', 'http://0.0.0.0/x'])('rechaza red privada %s', async u => {
    await expect(assertPublicUrl(u)).rejects.toThrow(/privada|resolver/);
  });

  it('acepta una IP pública', async () => {
    await expect(assertPublicUrl('https://8.8.8.8/hook')).resolves.toBeUndefined();
  });

  it('ALLOW_PRIVATE_WEBHOOKS permite redes privadas (solo desarrollo)', async () => {
    process.env['ALLOW_PRIVATE_WEBHOOKS'] = 'true';
    await expect(assertPublicUrl('http://localhost:9912/hook')).resolves.toBeUndefined();
  });
});
