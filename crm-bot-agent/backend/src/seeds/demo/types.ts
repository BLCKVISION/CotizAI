import type { Rng } from './rng.js';

export type Stage = 'nuevo' | 'contactado' | 'calificado' | 'interesado' | 'negociacion' | 'cerrado' | 'perdido';
export type Turn = { s: 'client' | 'ai' | 'human' | 'auto'; t: string; gapMin?: number };

export interface ProductSeed { name: string; sku: string; category: string; description: string; price: number; cost: number; track: boolean; stock: number; min: number; initial: number; active?: boolean }
export interface ContactPlan { stage: Stage; n: number; ageDays: [number, number]; flags?: ('needsHuman' | 'unread' | 'vip' | 'complaint' | 'urgent')[] }

export interface Profile {
  key: string;
  funnelTemplate: string;
  bcvRate: number;
  agent: { name: string; businessName: string; industry: string; tone: string; instructions: string; greeting: string; restrictions: string; salesFlow: string; agentRole: string;
    faq: { question: string; answer: string }[]; handoffKeywords: string[]; handoffMessage: string; outOfHoursMessage: string; hours: { enabled: boolean; days: number[]; start: string; end: string } };
  products: ProductSeed[];
  contactPlan: ContactPlan[];
  sources: readonly string[];
  tags: readonly string[];
  templates: { name: string; category: string; status: string; body: string }[];
  docs: { title: string; category: string; content: string }[];
  automations: { name: string; trigger: 'inactivity' | 'appointment_created' | 'status_changed'; conditions: Record<string, unknown>; actions: Record<string, unknown>; runs: number; lastRunDaysAgo: number }[];
  /** Conversación guionizada según la etapa; `ctx` trae el producto/servicio y datos del cliente. */
  script: (stage: Stage, ctx: ScriptCtx) => ScriptResult;
}
export interface ScriptCtx { r: Rng; first: string; product: ProductSeed; product2: ProductSeed; orderNo: number; rate: number; urgent?: boolean; complaint?: boolean; human: string }
export interface ApptPlan { title: string; service: string; whenDaysFromNow: number; hour: number; status: 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_asistio'; by: 'ai' | 'user'; notes?: string }

export interface ScriptResult { turns: Turn[]; data: Record<string, string>; score: number; notes: string; appt?: ApptPlan | ApptPlan[] }
