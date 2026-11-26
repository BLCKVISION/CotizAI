import { describe, expect, it } from 'vitest';
import type { AutomationRule } from '../crm/entities.js';
import { agentFromV1, apptStatusIn, chunkText, clampInt, convStatus, formatFaq, likePattern, messageView, parseFaq, productView, ruleFromV1, ruleToV1, senderOut, slugify, templateView, tplStatusIn } from './mappers.js';
import { stripUndefined } from './common.js';

const rule = (o: Partial<AutomationRule>) => ({ id: 'r1', name: 'n', trigger: 'inactivity', conditions: {}, actions: {}, active: true, templateName: '', runs: 0, lastRunAt: null, createdAt: new Date(), ...o }) as AutomationRule;

describe('reglas Replay ↔ nuestras', () => {
  it('inactivity_24h: usa waitHours (24 por defecto) y la etapa', () => {
    const d = ruleFromV1({ name: 'x', trigger: 'inactivity_24h', conditions: { stage: 'contactado' }, actions: { sendTemplate: 'seg', moveStage: 'interesado' } });
    expect(d.trigger).toBe('inactivity');
    expect(d.conditions).toEqual({ status: 'contactado', waitHours: 24 });
    expect(d.actions).toEqual({ moveStatus: 'interesado' });
    expect(d.templateName).toBe('seg');
  });
  it('acepta stageFrom/stageTo/templateName del modal de Replay', () => {
    const d = ruleFromV1({ name: 'x', trigger: 'inactivity_24h', stageFrom: 'nuevo', stageTo: 'contactado', templateName: 't' });
    expect(d.conditions).toEqual({ status: 'nuevo', waitHours: 24 });
    expect(d.actions).toEqual({ moveStatus: 'contactado' });
    expect(d.templateName).toBe('t');
  });
  it('stage_changed ↔ status_changed con toStage', () => {
    const d = ruleFromV1({ name: 'x', trigger: 'stage_changed', conditions: { toStage: 'cerrado' }, actions: { sendText: 'hola' } });
    expect(d).toMatchObject({ trigger: 'status_changed', conditions: { toStatus: 'cerrado' }, actions: { sendText: 'hola' } });
  });
  it('post_appointment ↔ appointment_created', () => {
    expect(ruleFromV1({ trigger: 'post_appointment', actions: { moveStage: 'negociacion' } }).trigger).toBe('appointment_created');
  });
  it('ignora disparadores desconocidos', () => { expect(ruleFromV1({ trigger: 'nada' }).trigger).toBeUndefined(); });
  it('isActive o active', () => {
    expect(ruleFromV1({ isActive: false }).active).toBe(false);
    expect(ruleFromV1({ active: true }).active).toBe(true);
  });
  it('round-trip a formato Replay', () => {
    const v = ruleToV1(rule({ trigger: 'inactivity', conditions: { status: 'contactado', waitHours: 6 }, actions: { moveStatus: 'interesado', sendText: 'x' }, templateName: 'tpl' }));
    expect(v).toMatchObject({ trigger: 'inactivity_24h', conditions: { stage: 'contactado', waitHours: 6 }, actions: { moveStage: 'interesado', sendTemplate: 'tpl', sendText: 'x' }, isActive: true });
    expect(ruleToV1(rule({ trigger: 'appointment_created' })).trigger).toBe('post_appointment');
    expect(ruleToV1(rule({ trigger: 'status_changed', conditions: { toStatus: 'cerrado' } })).conditions).toEqual({ toStage: 'cerrado' });
  });
});

describe('FAQ texto ↔ lista', () => {
  it('parsea una pregunta por línea', () => {
    expect(parseFaq('¿Dónde?: Av. Principal 1\n¿Horario?: 9: a 18\n\nsin respuesta\n')).toEqual([{ question: '¿Dónde?', answer: 'Av. Principal 1' }, { question: '¿Horario?', answer: '9: a 18' }]);
  });
  it('formatea y es reversible', () => {
    const items = [{ question: 'A?', answer: 'B' }, { question: 'C?', answer: 'D' }];
    expect(parseFaq(formatFaq(items))).toEqual(items);
  });
  it('limita a 50 entradas', () => { expect(parseFaq(Array.from({ length: 80 }, (_, i) => `q${i}: a`).join('\n'))).toHaveLength(50); });
});

describe('chunkText', () => {
  it('un texto corto es un solo fragmento', () => { expect(chunkText('Hola mundo')).toEqual(['Hola mundo']); });
  it('respeta el tamaño máximo y no pierde texto', () => {
    const text = Array.from({ length: 30 }, (_, i) => `Párrafo ${i}. ` + 'frase de relleno. '.repeat(20)).join('\n\n');
    const chunks = chunkText(text, 500);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every(c => c.length <= 500)).toBe(true);
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toContain('Párrafo 29.');
  });
  it('parte una frase gigante sin espacios', () => {
    const chunks = chunkText('x'.repeat(2000), 800);
    expect(chunks.every(c => c.length <= 800)).toBe(true);
    expect(chunks.join('').length).toBe(2000);
  });
  it('texto vacío → sin fragmentos', () => { expect(chunkText('  \n\n ')).toEqual([]); });
});

describe('estados y traducciones', () => {
  it('citas: vocabulario Replay y nuestro', () => {
    expect(apptStatusIn('scheduled')).toBe('pendiente'); expect(apptStatusIn('pending')).toBe('pendiente'); expect(apptStatusIn('confirmed')).toBe('confirmada');
    expect(apptStatusIn('cancelled')).toBe('cancelada'); expect(apptStatusIn('no_show')).toBe('no_asistio'); expect(apptStatusIn('completada')).toBe('completada');
    expect(apptStatusIn('raro')).toBeNull(); expect(apptStatusIn(undefined)).toBeNull();
  });
  it('plantillas: APPROVED/PENDING… ↔ aprobada/pendiente…', () => {
    expect(tplStatusIn('APPROVED')).toBe('aprobada'); expect(tplStatusIn('rejected')).toBe('rechazada'); expect(tplStatusIn('x')).toBeNull();
    expect(templateView({ id: 'i', name: 'n', category: 'UTILITY', language: 'es', status: 'aprobada', body: 'hola', components: [], createdAt: new Date() } as never).status).toBe('APPROVED');
  });
  it('estado de conversación', () => {
    const base = { resolved: false, needsHuman: false, botPausedUntil: null };
    expect(convStatus(base)).toBe('bot');
    expect(convStatus({ ...base, needsHuman: true })).toBe('human');
    expect(convStatus({ ...base, botPausedUntil: new Date(Date.now() + 60_000) })).toBe('human');
    expect(convStatus({ ...base, botPausedUntil: new Date(Date.now() - 60_000) })).toBe('bot');
    expect(convStatus({ ...base, needsHuman: true, resolved: true })).toBe('resolved');
  });
  it('remitentes y mensajes', () => {
    expect([senderOut('client'), senderOut('human'), senderOut('ai'), senderOut('auto')]).toEqual(['customer', 'agent', 'bot', 'bot']);
    const m = messageView({ id: '1', contactId: 'c', body: 'hola', sender: 'auto', direction: 'out', createdAt: new Date() });
    expect(m).toMatchObject({ conversationId: 'c', content: 'hola', sender: 'bot', automated: true, direction: 'outbound', type: 'text' });
  });
  it('producto: priceVef y stockStatus', () => {
    const p = { id: 'p', name: 'n', description: '', price: 20, currency: 'USD', imageUrl: '', sku: '', category: '', active: true, cost: 5, trackStock: true, stock: 2, minStock: 3, createdAt: new Date(), updatedAt: new Date() } as never;
    expect(productView(p, 40)).toMatchObject({ priceVef: 800, stockStatus: 'low', isAvailable: true });
    expect(productView(p, null).priceVef).toBeNull();
    expect(productView({ ...(p as object), stock: 0 } as never, null).stockStatus).toBe('out');
    expect(productView({ ...(p as object), trackStock: false } as never, null).stockStatus).toBe('untracked');
  });
});

describe('agente: ai-config ↔ AgentConfig', () => {
  it('solo mapea las claves presentes', () => {
    expect(agentFromV1({ agentName: 'Luna', isAiActive: false, businessType: 'Retail' })).toEqual({ name: 'Luna', enabled: false, industry: 'Retail' });
    expect(agentFromV1({})).toEqual({});
  });
  it('faq como texto o como lista', () => {
    expect(agentFromV1({ faq: 'A?: B' }).faq).toEqual([{ question: 'A?', answer: 'B' }]);
    expect(agentFromV1({ faq: 'A?: B', faqItems: [{ question: 'X', answer: 'Y' }] }).faq).toEqual([{ question: 'X', answer: 'Y' }]);
  });
});

describe('utilidades', () => {
  it('clampInt acota y usa el valor por defecto', () => {
    expect(clampInt('500', 20, 1, 100)).toBe(100); expect(clampInt('-3', 20, 1, 100)).toBe(1); expect(clampInt('abc', 20, 1, 100)).toBe(20); expect(clampInt(undefined, 7, 1, 9)).toBe(7);
  });
  it('likePattern escapa comodines', () => { expect(likePattern('50%_a\\')).toBe('%50\\%\\_a\\\\%'); });
  it('slugify', () => { expect(slugify('Clínica Ñandú & Cía.')).toBe('clinica-nandu-cia'); expect(slugify('***')).toBe('empresa'); });
  it('stripUndefined quita claves undefined en profundidad', () => {
    expect(stripUndefined({ a: 1, b: undefined, c: { d: undefined, e: [{ f: undefined, g: 2 }] } })).toEqual({ a: 1, c: { e: [{ g: 2 }] } });
  });
});
