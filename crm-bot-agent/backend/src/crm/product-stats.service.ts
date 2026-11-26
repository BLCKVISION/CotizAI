import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, Message, Product, StockMovement } from './entities.js';

export interface ProductStats {
  unitsSold: number; unitsSold30d: number; revenue: number; profit: number; marginPct: number | null;
  requests30d: number; demandScore: number; demand: 'high' | 'medium' | 'low' | 'none';
}

const DAY = 86_400_000;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Salidas de stock que NO son ventas (mermas, ajustes, devoluciones…): no cuentan como unidades vendidas. */
const NON_SALE = /merma|dañ|dan[ií]ad|perd[ií]|robo|vencid|ajuste|conteo|devoluci|muestra|obsequio|uso interno/i;

/**
 * Métricas de cada producto a partir de datos reales:
 *  - unidades vendidas: salidas de stock que no son mermas/ajustes; en servicios, citas completadas de ese servicio
 *  - ganancia: unidades × (precio − costo), con el precio y el costo ACTUALES (no hay histórico de precios)
 *  - solicitudes: clientes distintos que mencionaron el producto en mensajes de los últimos 30 días
 *  - demanda: combina ventas y solicitudes de 30 días frente al producto más pedido del catálogo
 */
@Injectable()
export class ProductStatsService {
  constructor(
    @InjectRepository(StockMovement) private moves: Repository<StockMovement>,
    @InjectRepository(Appointment) private appts: Repository<Appointment>,
    @InjectRepository(Message) private msgs: Repository<Message>,
  ) {}

  async compute(userId: string, products: Product[]): Promise<Map<string, ProductStats>> {
    const since = new Date(Date.now() - 30 * DAY);
    const [outs, done, inbound] = await Promise.all([
      this.moves.find({ where: { userId, type: 'out' }, select: { productId: true, quantity: true, reason: true, createdAt: true }, take: 50_000 }),
      this.appts.find({ where: { userId, status: 'completada' }, select: { service: true, title: true, startsAt: true }, take: 20_000 }),
      this.msgs.createQueryBuilder('m').select(['m.contactId', 'm.body']).where('m.userId = :userId AND m.direction = :d AND m.createdAt >= :since', { userId, d: 'in', since }).orderBy('m.createdAt', 'DESC').take(20_000).getMany(),
    ]);
    const sold = new Map<string, { all: number; d30: number }>();
    for (const o of outs) {
      if (NON_SALE.test(o.reason)) continue;
      const s = sold.get(o.productId) ?? { all: 0, d30: 0 };
      s.all += o.quantity; if (o.createdAt >= since) s.d30 += o.quantity;
      sold.set(o.productId, s);
    }
    const bodies = inbound.map(m => ({ c: m.contactId, t: norm(m.body) }));
    const draft = products.map(p => {
      const name = norm(p.name);
      const word = name.split(' ').filter(w => w.length >= 6).sort((a, b) => b.length - a.length)[0];
      const keys = [name, ...(name.includes(' ') && word ? [word] : [])];
      let units = sold.get(p.id) ?? { all: 0, d30: 0 };
      if (!p.trackStock) { // servicios: citas completadas con ese servicio
        const mine = done.filter(a => { const s = norm(a.service || a.title); return s && (s.includes(name) || name.includes(s)); });
        units = { all: mine.length, d30: mine.filter(a => a.startsAt >= since).length };
      }
      const requesters = new Set(bodies.filter(b => keys.some(k => k && b.t.includes(k))).map(b => b.c));
      return { p, units, req: requesters.size };
    });
    const maxU = Math.max(0, ...draft.map(d => d.units.d30)), maxR = Math.max(0, ...draft.map(d => d.req));
    return new Map(draft.map(({ p, units, req }) => {
      const score = Math.round(60 * (maxU ? units.d30 / maxU : 0) + 40 * (maxR ? req / maxR : 0));
      const demand: ProductStats['demand'] = score >= 66 ? 'high' : score >= 33 ? 'medium' : score > 0 ? 'low' : 'none';
      return [p.id, {
        unitsSold: units.all, unitsSold30d: units.d30, revenue: round2(units.all * p.price), profit: round2(units.all * (p.price - p.cost)),
        marginPct: p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 100) : null, requests30d: req, demandScore: score, demand,
      }];
    }));
  }
}
