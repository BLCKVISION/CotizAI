/** Convierte "YYYY-MM-DDTHH:mm" (hora local de `tz`) a un Date UTC. */
export function zonedToUtc(local: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return Date.UTC(+p['year'], +p['month'] - 1, +p['day'], +p['hour'], +p['minute']) - t;
  };
  const first = asUtc - offset(asUtc);
  const d2 = new Date(asUtc - offset(first));
  return isNaN(+d2) ? null : d2;
}

export function nowInZone(tz: string) {
  return new Intl.DateTimeFormat('es', { timeZone: tz, dateStyle: 'full', timeStyle: 'short' }).format(new Date());
}
