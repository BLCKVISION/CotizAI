import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtGuard } from '../auth/jwt.guard.js';
import { CONTACT_STATUSES, Contact } from '../crm/entities.js';
import { clampInt } from './mappers.js';
import type { Req_ } from './common.js';

const PERIODS = [7, 30, 90];
const period = (v: string | undefined, def: number) => { const n = clampInt(v, def, 1, 365); return PERIODS.includes(n) ? n : def; };
const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Base de los dos controladores: consultas agregadas en SQL, siempre acotadas por userId. */
abstract class Insights {
  constructor(protected contacts: Repository<Contact>, protected config: ConfigService) {}
  protected get tz() { return this.config.get<string>('AGENT_TIMEZONE') || 'Europe/Madrid'; }
  protected q<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> { return this.contacts.query(sql, params); }

  /** Serie diaria (con ceros) a partir de filas {d:'YYYY-MM-DD', ...}. */
  protected days(n: number) {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: this.tz });
    return Array.from({ length: n }, (_, i) => fmt.format(new Date(Date.now() - (n - 1 - i) * 86400_000)));
  }
}

@Controller('v1/dashboard')
@UseGuards(JwtGuard)
export class DashboardV1Controller extends Insights {
  constructor(@InjectRepository(Contact) contacts: Repository<Contact>, config: ConfigService) { super(contacts, config); }

  @Get('stats') async stats(@Req() r: Req_, @Query('period') p?: string) {
    const n = period(p, 7), u = r.userId, since = new Date(Date.now() - n * 86400_000), tz = this.tz;
    const [[m], [c], [a], pipeline, perDay, [low]] = await Promise.all([
      this.q<{ ai: number; human: number; customer: number }>(`SELECT count(*) FILTER (WHERE sender='ai')::int AS ai, count(*) FILTER (WHERE sender='human')::int AS human, count(*) FILTER (WHERE direction='in')::int AS customer FROM messages WHERE "userId"=$1 AND "createdAt">=$2`, [u, since]),
      this.q<{ total: number; fresh: number; interventions: number }>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE "createdAt">=$2)::int AS fresh, count(*) FILTER (WHERE "needsHuman")::int AS interventions FROM contacts WHERE "userId"=$1`, [u, since]),
      this.q<{ today: number; week: number }>(`SELECT count(*) FILTER (WHERE ("startsAt" AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date)::int AS today, count(*) FILTER (WHERE "startsAt" >= now() AND "startsAt" <= now() + interval '7 days')::int AS week FROM appointments WHERE "userId"=$1 AND status <> 'cancelada'`, [u, tz]),
      this.q<{ stage: string; count: number }>(`SELECT status AS stage, count(*)::int AS count FROM contacts WHERE "userId"=$1 GROUP BY status`, [u]),
      this.q<{ d: string; ai: number; human: number; customer: number }>(`SELECT to_char("createdAt" AT TIME ZONE $3, 'YYYY-MM-DD') AS d, count(*) FILTER (WHERE sender='ai')::int AS ai, count(*) FILTER (WHERE sender='human')::int AS human, count(*) FILTER (WHERE direction='in')::int AS customer FROM messages WHERE "userId"=$1 AND "createdAt">=$2 GROUP BY d`, [u, since, tz]),
      this.q<{ n: number }>(`SELECT count(*)::int AS n FROM products WHERE "userId"=$1 AND "trackStock" AND active AND stock <= "minStock"`, [u]),
    ]);
    const byDay = new Map(perDay.map(x => [x.d, x]));
    const rate = m.ai + m.human > 0 ? Math.round((m.ai / (m.ai + m.human)) * 100) : 0;
    return {
      aiMessages: m.ai, humanMessages: m.human, newLeads: c.fresh, totalContacts: c.total, appointmentsToday: a.today, appointmentsWeek: a.week,
      automationRate: rate, responseRate: rate, interventions: c.interventions, lowStock: low.n,
      pipeline: CONTACT_STATUSES.map(s => ({ stage: s, count: pipeline.find(x => x.stage === s)?.count ?? 0 })),
      trend: this.days(n).map(d => ({ date: d, ai: byDay.get(d)?.ai ?? 0, human: byDay.get(d)?.human ?? 0, customer: byDay.get(d)?.customer ?? 0 })),
    };
  }
}

@Controller('v1/reports')
@UseGuards(JwtGuard)
export class ReportsV1Controller extends Insights {
  constructor(@InjectRepository(Contact) contacts: Repository<Contact>, config: ConfigService) { super(contacts, config); }

  @Get('summary') async summary(@Req() r: Req_, @Query('period') p?: string) {
    const n = period(p, 30), u = r.userId, since = new Date(Date.now() - n * 86400_000), tz = this.tz;
    const [stages, [msg], [appt], hours, leadsDay, msgDay, apptDay, sources, [ai], [human], week] = await Promise.all([
      this.q<{ status: string; total: number; fresh: number; blocked: number }>(`SELECT status, count(*)::int AS total, count(*) FILTER (WHERE "createdAt">=$2)::int AS fresh, count(*) FILTER (WHERE resolved)::int AS blocked FROM contacts WHERE "userId"=$1 GROUP BY status`, [u, since]),
      this.q<{ inbound: number; ai: number; human: number; total: number }>(`SELECT count(*) FILTER (WHERE direction='in')::int AS inbound, count(*) FILTER (WHERE sender='ai')::int AS ai, count(*) FILTER (WHERE sender='human')::int AS human, count(*)::int AS total FROM messages WHERE "userId"=$1 AND "createdAt">=$2`, [u, since]),
      this.q<{ total: number; byAi: number }>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE "createdBy"='ai')::int AS "byAi" FROM appointments WHERE "userId"=$1 AND "createdAt">=$2`, [u, since]),
      this.q<{ h: number; n: number }>(`SELECT extract(hour FROM "createdAt" AT TIME ZONE $3)::int AS h, count(*)::int AS n FROM messages WHERE "userId"=$1 AND direction='in' AND "createdAt">=$2 GROUP BY h`, [u, since, tz]),
      this.q<{ d: string; n: number }>(`SELECT to_char("createdAt" AT TIME ZONE $3,'YYYY-MM-DD') AS d, count(*)::int AS n FROM contacts WHERE "userId"=$1 AND "createdAt">=$2 GROUP BY d`, [u, since, tz]),
      this.q<{ d: string; n: number }>(`SELECT to_char("createdAt" AT TIME ZONE $3,'YYYY-MM-DD') AS d, count(*)::int AS n FROM messages WHERE "userId"=$1 AND "createdAt">=$2 GROUP BY d`, [u, since, tz]),
      this.q<{ d: string; n: number }>(`SELECT to_char("createdAt" AT TIME ZONE $3,'YYYY-MM-DD') AS d, count(*)::int AS n FROM appointments WHERE "userId"=$1 AND "createdAt">=$2 GROUP BY d`, [u, since, tz]),
      this.q<{ source: string; leads: number; closed: number }>(`SELECT source, count(*)::int AS leads, count(*) FILTER (WHERE status='cerrado')::int AS closed FROM contacts WHERE "userId"=$1 GROUP BY source ORDER BY leads DESC LIMIT 10`, [u]),
      this.responseTime(u, 'ai', since),
      this.responseTime(u, 'human', since),
      this.q<{ d: string; inbound: number; ai: number; human: number }>(`SELECT to_char("createdAt" AT TIME ZONE $2,'YYYY-MM-DD') AS d, count(*) FILTER (WHERE direction='in')::int AS inbound, count(*) FILTER (WHERE sender='ai')::int AS ai, count(*) FILTER (WHERE sender='human')::int AS human FROM messages WHERE "userId"=$1 AND "createdAt">=now() - interval '8 days' GROUP BY d`, [u, tz]),
    ]);
    const count = (s: string) => stages.find(x => x.status === s)?.total ?? 0;
    const fresh = (s: string) => stages.find(x => x.status === s)?.fresh ?? 0;
    const total = stages.reduce((s, x) => s + x.total, 0);
    const newLeads = stages.reduce((s, x) => s + x.fresh, 0);
    const qualified = ['calificado', 'interesado', 'negociacion', 'cerrado'].reduce((s, k) => s + fresh(k), 0);
    const bot = msg.ai + msg.human;
    const hoursArr = Array.from({ length: 24 }, (_, h) => hours.find(x => x.h === h)?.n ?? 0);
    const peak = Math.max(...hoursArr);
    const series = (rows: { d: string; n: number }[]) => this.days(n).map(d => ({ date: d, value: rows.find(x => x.d === d)?.n ?? 0 }));
    const NAMES: Record<string, string> = { nuevo: 'Nuevos', contactado: 'Contactados', calificado: 'Calificados', interesado: 'Interesados', negociacion: 'Negociación', cerrado: 'Cerrados', perdido: 'Perdidos' };
    return {
      period: n, totalContacts: total, wonContacts: count('cerrado'), lostContacts: count('perdido'), activeConversations: total - stages.reduce((s, x) => s + x.blocked, 0),
      conversionRate: total ? Math.round((count('cerrado') / total) * 1000) / 10 : 0,
      stageCounts: Object.fromEntries(CONTACT_STATUSES.map(s => [s, count(s)])),
      newLeads, qualifiedLeads: qualified, qualifiedPct: newLeads ? Math.round((qualified / newLeads) * 100) : 0, closedPct: qualified ? Math.round((fresh('cerrado') / qualified) * 100) : 0,
      appointmentsCount: appt.total, appointmentsByAi: appt.byAi,
      responseRate: msg.inbound ? Math.min(100, Math.round((bot / msg.inbound) * 100)) : 0, messagesPerLead: newLeads ? Math.round(msg.total / newLeads) : 0,
      peakHour: peak > 0 ? hoursArr.indexOf(peak) : null, interventions: await this.interventions(u), aiShare: bot ? Math.round((msg.ai / bot) * 100) : 0,
      aiResponseTimeAvgSeconds: ai?.v ?? null, humanResponseTimeAvgMinutes: human?.v === null || human?.v === undefined ? null : Math.round((human.v / 60) * 10) / 10,
      messagesProcessedPeriod: msg.total,
      funnel: CONTACT_STATUSES.filter(s => s !== 'perdido').map(s => ({ stage: s, name: NAMES[s], count: count(s) })),
      hours: hoursArr,
      timeline: { leads: series(leadsDay), messages: series(msgDay), appointments: series(apptDay) },
      weeklyActivity: this.days(7).map(d => ({ day: DAYS_ES[new Date(`${d}T12:00:00Z`).getUTCDay()], date: d, inbound: week.find(x => x.d === d)?.inbound ?? 0, outboundAi: week.find(x => x.d === d)?.ai ?? 0, human: week.find(x => x.d === d)?.human ?? 0 })),
      sources,
    };
  }

  private async interventions(u: string) { return (await this.q<{ n: number }>(`SELECT count(*)::int AS n FROM contacts WHERE "userId"=$1 AND "needsHuman"`, [u]))[0].n; }

  /** Media (en segundos) entre un mensaje del cliente y la respuesta del `sender` indicado. */
  private async responseTime(u: string, sender: 'ai' | 'human', since: Date) {
    const rows = await this.q<{ v: number | null }>(
      `SELECT round(avg(extract(epoch FROM (o."createdAt" - i."createdAt")))::numeric, 1)::float AS v FROM messages o
       JOIN LATERAL (SELECT "createdAt" FROM messages i WHERE i."contactId" = o."contactId" AND i.direction='in' AND i."createdAt" <= o."createdAt" ORDER BY i."createdAt" DESC LIMIT 1) i ON true
       WHERE o."userId"=$1 AND o.sender=$2 AND o."createdAt">=$3`, [u, sender, since]);
    return [rows[0] ?? { v: null }];
  }
}
