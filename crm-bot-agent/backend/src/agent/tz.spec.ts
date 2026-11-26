import { describe, expect, it } from 'vitest';
import { zonedToUtc } from './tz.js';

describe('zonedToUtc', () => {
  it('convierte hora local de Madrid a UTC (verano e invierno)', () => {
    expect(zonedToUtc('2026-07-01T11:00', 'Europe/Madrid')?.toISOString()).toBe('2026-07-01T09:00:00.000Z');
    expect(zonedToUtc('2026-01-15T11:00', 'Europe/Madrid')?.toISOString()).toBe('2026-01-15T10:00:00.000Z');
  });

  it('devuelve null con formato inválido', () => {
    expect(zonedToUtc('mañana', 'Europe/Madrid')).toBeNull();
  });
});
