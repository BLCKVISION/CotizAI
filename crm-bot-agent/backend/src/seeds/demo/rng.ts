/** Generador pseudoaleatorio determinista (mulberry32): los datos de demostración salen iguales en cada ejecución. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!,
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof rng>;

/** Hora local de Caracas (UTC-4) de hace `daysAgo` días, convertida a Date. */
export function at(daysAgo: number, hour: number, minute = 0, now = Date.now()) {
  const d = new Date(now - daysAgo * 86_400_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour + 4, minute));
}

const FIRST = ['María', 'José', 'Luis', 'Ana', 'Carlos', 'Valentina', 'Andrés', 'Daniela', 'Miguel', 'Gabriela', 'Jorge', 'Carolina', 'Pedro', 'Sofía', 'Rafael', 'Mariana', 'Daniel', 'Isabella', 'Alejandro', 'Paola', 'Fernando', 'Lucía', 'Ricardo', 'Andreína', 'Héctor', 'Yohana', 'Samuel', 'Natalia'];
const LAST = ['Rodríguez', 'González', 'Pérez', 'Hernández', 'Díaz', 'Martínez', 'Ramírez', 'Torres', 'Morales', 'Rojas', 'Mendoza', 'Salazar', 'Contreras', 'Ortega', 'Silva', 'Navarro', 'Blanco', 'Paredes', 'Medina', 'Castillo', 'Guerra', 'Rivas'];
export function people(r: Rng, n: number) {
  const out: { name: string; first: string; phone: string; email: string }[] = [];
  const used = new Set<string>();
  while (out.length < n) {
    const first = r.pick(FIRST), last = r.pick(LAST), name = `${first} ${last}`;
    if (used.has(name)) continue;
    used.add(name);
    const phone = `+58 ${r.pick(['412', '414', '416', '424', '426'])} ${r.int(100, 999)} ${r.int(1000, 9999)}`;
    const slug = `${first}.${last}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    out.push({ name, first, phone, email: r.chance(0.55) ? `${slug}${r.int(1, 99)}@${r.pick(['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com'])}` : '' });
  }
  return out;
}
