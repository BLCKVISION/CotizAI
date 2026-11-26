import { DataSource, EntityManager } from 'typeorm';
import { AgentConfig, Appointment, AutomationRule, BusinessSettings, Contact, FunnelStep, KnowledgeDoc, Message, Product, StockMovement, WaTemplate } from '../../crm/entities.js';
import { FUNNEL_TEMPLATES } from '../../crm/presets.js';
import { at, people, rng } from './rng.js';
import type { ApptPlan, ContactPlan, Profile, Stage, Turn } from './types.js';

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const MIN = 60_000;
const STEP_BY_STAGE: Record<Stage, (k: number) => number> = { nuevo: () => 0, contactado: () => 0, calificado: () => 1, interesado: () => 1, negociacion: k => k - 1, cerrado: k => k - 1, perdido: () => 1 };

/**
 * Carga datos de demostración como si la cuenta llevara ~2 meses en uso: catálogo con historial de inventario,
 * clientes en todas las etapas con sus conversaciones, citas pasadas y futuras, plantillas, conocimiento y automatizaciones.
 * Idempotente: si el usuario ya tiene clientes no toca nada. Determinista por perfil.
 */
export async function seedDemo(ds: DataSource, userId: string, prof: Profile) {
  if ((await ds.getRepository(Contact).countBy({ userId })) > 0) return { skipped: true as const };
  const now = Date.now();
  const r = rng(hash(prof.key));
  return ds.transaction(async (m: EntityManager) => {
    // Ajustes, agente y funnel
    await m.save(BusinessSettings, m.create(BusinessSettings, { ...(await m.findOneBy(BusinessSettings, { userId })), userId, bcvRate: prof.bcvRate, bcvAuto: true, bcvUpdatedAt: new Date(now - 6 * 3600_000) }));
    const a = prof.agent;
    await m.save(AgentConfig, m.create(AgentConfig, { ...(await m.findOneBy(AgentConfig, { userId })), userId, configured: true, enabled: true, ...a, personality: a.tone, language: 'es', model: 'claude-sonnet-5-5', temperature: 0.6 }));
    const tpl = FUNNEL_TEMPLATES[prof.funnelTemplate]!;
    await m.save(FunnelStep, tpl.steps.map((s, i) => m.create(FunnelStep, { ...s, position: i, userId, createdAt: at(62, 10), updatedAt: at(62, 10) })));

    // Catálogo con historial de inventario coherente: el stock actual es el resultado de todos los movimientos
    const products: Product[] = [];
    let movements = 0;
    for (const s of prof.products) {
      const p = await m.save(Product, m.create(Product, { userId, name: s.name, sku: s.sku, category: s.category, description: s.description, price: s.price, cost: s.cost, active: s.active !== false, trackStock: s.track, stock: s.track ? s.stock : 0, minStock: s.min, currency: 'USD', createdAt: at(62, 10), updatedAt: at(2, 9) }));
      products.push(p);
      if (!s.track) continue;
      let restock = Math.max(0, Math.round(s.initial * 0.7));
      if (s.stock > s.initial + restock) restock = s.stock - s.initial;
      const outs = s.initial + restock - s.stock;
      const outsBefore = Math.min(s.initial, Math.round(outs * 0.6)), outsAfter = outs - outsBefore;
      const ev: { type: 'in' | 'out'; qty: number; when: Date; reason: string }[] = [{ type: 'in', qty: s.initial, when: at(62, 10), reason: 'Stock inicial' }];
      const spread = (total: number, fromDay: number, toDay: number) => { let left = total; while (left > 0) { const q = Math.min(left, r.int(1, 3)); ev.push({ type: 'out', qty: q, when: at(r.int(toDay, fromDay), r.int(9, 19), r.int(0, 59)), reason: `Venta · pedido #${r.int(1001, 1099)}` }); left -= q; } };
      spread(outsBefore, 58, 31);
      if (restock > 0) ev.push({ type: 'in', qty: restock, when: at(30, 11), reason: `Compra a proveedor · PRV-${r.int(100, 999)}` });
      spread(outsAfter, 28, 1);
      ev.sort((x, y) => +x.when - +y.when);
      let run = 0;
      const rows = ev.map(e => { const before = run; run += e.type === 'in' ? e.qty : -e.qty; return m.create(StockMovement, { userId, productId: p.id, type: e.type, quantity: e.qty, stockBefore: before, stockAfter: run, reason: e.reason, createdAt: e.when, updatedAt: e.when }); });
      if (run !== s.stock) throw new Error(`Inventario incoherente en ${s.name}: ${run} ≠ ${s.stock}`);
      await m.save(StockMovement, rows, { chunk: 200 });
      movements += rows.length;
    }

    // Plantillas, conocimiento y automatizaciones
    await m.save(WaTemplate, prof.templates.map((t, i) => m.create(WaTemplate, { userId, name: t.name, category: t.category, language: 'es', status: t.status, body: t.body, components: [{ type: 'BODY', text: t.body }], createdAt: at(55 - i * 3, 12), updatedAt: at(40 - i, 12) })));
    await m.save(KnowledgeDoc, prof.docs.map((d, i) => m.create(KnowledgeDoc, { userId, title: d.title, category: d.category, content: d.content, synced: true, chunkIndex: 0, createdAt: at(58 - i * 2, 13), updatedAt: at(58 - i * 2, 13) })));
    await m.save(AutomationRule, prof.automations.map((x, i) => m.create(AutomationRule, { userId, name: x.name, trigger: x.trigger, conditions: x.conditions, actions: x.actions, active: true, runs: x.runs, lastRunAt: at(x.lastRunDaysAgo, 11 + i), createdAt: at(50, 11), updatedAt: at(x.lastRunDaysAgo, 11) })));

    // Clientes, conversaciones y citas
    const total = prof.contactPlan.reduce((n, p) => n + p.n, 0);
    const crowd = people(r, total);
    const sellable = prof.products.filter(p => p.active !== false && (!p.track || p.stock > 0));
    const human = prof.key === 'moda' ? 'Albert' : 'Dr. Jiménez';
    const k = tpl.steps.length;
    let idx = 0, orderNo = 1008, msgs = 0, appts = 0;
    for (const plan of prof.contactPlan as ContactPlan[]) {
      for (let i = 0; i < plan.n; i++) {
        const person = crowd[idx++]!;
        const product = r.pick(sellable);
        const product2 = r.pick(sellable.filter(x => x !== product));
        const flags = plan.flags ?? [];
        const sc = prof.script(plan.stage, { r, first: person.first, product, product2, orderNo, rate: prof.bcvRate, urgent: flags.includes('urgent'), complaint: flags.includes('complaint'), human });
        if (plan.stage === 'cerrado') orderNo++;
        const turns: Turn[] = [...sc.turns];
        if (flags.includes('needsHuman') && !flags.includes('complaint') && !flags.includes('urgent')) turns.push({ s: 'client', t: 'Prefiero hablar con una persona, por favor', gapMin: 30 }, { s: 'ai', t: prof.agent.handoffMessage, gapMin: 1 });

        // Línea de tiempo: el primer mensaje a una hora de oficina del día de alta; nunca en el futuro
        const age = r.int(plan.ageDays[0], plan.ageDays[1]);
        let t0 = +at(age, r.int(9, 19), r.int(0, 59), now);
        const span = turns.slice(1).reduce((n, x) => n + (x.gapMin ?? 3), 0) * MIN;
        if (t0 + span > now - 10 * MIN) t0 = now - 10 * MIN - span;
        let t = t0;
        const stamps = turns.map((x, j) => (j === 0 ? t : (t += (x.gapMin ?? 3) * MIN)));
        const last = stamps[stamps.length - 1]!;

        const contact = await m.save(Contact, m.create(Contact, {
          userId, name: person.name, phone: person.phone, email: person.email, status: plan.stage, score: sc.score,
          source: r.pick(prof.sources), notes: sc.notes, needsHuman: flags.includes('needsHuman'),
          funnelStep: Math.min(STEP_BY_STAGE[plan.stage](k), k - 1), data: sc.data,
          tags: [...new Set([...(r.chance(0.6) ? [r.pick(prof.tags)] : []), ...(r.chance(0.2) ? [r.pick(prof.tags)] : []), ...(flags.includes('vip') ? ['vip'] : [])])],
          lastReadAt: new Date(flags.includes('unread') ? stamps[0]! + MIN : last + MIN), resolved: (plan.stage === 'cerrado' || plan.stage === 'perdido') && !flags.includes('complaint'),
          createdAt: new Date(t0), updatedAt: new Date(last),
        }));
        await m.save(Message, turns.map((x, j) => m.create(Message, { userId, contactId: contact.id, direction: x.s === 'client' ? 'in' : 'out', sender: x.s, body: x.t, externalId: null, createdAt: new Date(stamps[j]!), updatedAt: new Date(stamps[j]!) })), { chunk: 100 });
        msgs += turns.length;

        for (const ap of ([] as ApptPlan[]).concat(sc.appt ?? [])) {
          const starts = at(-ap.whenDaysFromNow, ap.hour, 0, now);
          const past = +starts < now;
          const created = new Date(Math.min(last, +starts - 24 * 3600_000));
          await m.save(Appointment, m.create(Appointment, {
            userId, contactId: contact.id, title: ap.title, service: ap.service, startsAt: starts, endsAt: new Date(+starts + 45 * MIN), status: ap.status,
            notes: ap.notes ?? '', createdBy: ap.by, reminder24hSent: past || +starts - now < 24 * 3600_000, reminder2hSent: past, createdAt: created, updatedAt: past ? starts : created,
          }));
          appts++;
        }
      }
    }
    return { skipped: false as const, contacts: total, messages: msgs, appointments: appts, products: products.length, movements };
  });
}
