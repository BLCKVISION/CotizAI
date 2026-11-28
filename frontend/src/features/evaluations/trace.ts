// Dependency-free on purpose so it runs in the plain-Node unit tests.
/** Live decision trace of an evaluation run (admin only): event types, SSE parsing and the pure view logic. */

export type TraceEventType = 'hypothesis' | 'tool_call' | 'tool_result' | 'reflection' | 'decision' | 'final_answer';
export type StepStatus = 'running' | 'completed' | 'failed';

export type TraceEvent = {
  id: string;
  runId: string;
  /** Strictly increasing per run; the stream resumes after the last one seen. */
  seq: number;
  timestamp: string;
  type: TraceEventType;
  title: string;
  summary: string;
  metadata: { tool?: string; node?: string; latency_ms?: number; status?: StepStatus; confidence?: number; count?: number; proposal_id?: string; args?: Record<string, unknown> };
};

export type SseMessage = { event: string; id: string | null; data: string };

const TYPES: readonly string[] = ['hypothesis', 'tool_call', 'tool_result', 'reflection', 'decision', 'final_answer'];

/** Splits a text buffer into complete SSE messages and returns what is left of the last, unfinished one. */
export function parseSse(buffer: string): { messages: SseMessage[]; rest: string } {
  const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = blocks.pop() ?? '';
  const messages: SseMessage[] = [];
  for (const block of blocks) {
    let event = 'message';
    let id: string | null = null;
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':') || line === '') continue; // comment lines are heartbeats
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'id') id = value;
      else if (field === 'data') data.push(value);
    }
    if (data.length > 0) messages.push({ event, id, data: data.join('\n') });
  }
  return { messages, rest };
}

/** Validates what came from the wire: a malformed event is dropped instead of breaking the timeline. */
export function toTraceEvent(raw: unknown): TraceEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || typeof e.seq !== 'number' || typeof e.type !== 'string' || !TYPES.includes(e.type)) return null;
  return {
    id: e.id,
    runId: String(e.runId ?? e.run_id ?? ''),
    seq: e.seq,
    timestamp: String(e.timestamp ?? ''),
    type: e.type as TraceEventType,
    title: String(e.title ?? ''),
    summary: String(e.summary ?? ''),
    metadata: typeof e.metadata === 'object' && e.metadata !== null ? (e.metadata as TraceEvent['metadata']) : {},
  };
}

/** Adds an event keeping order and ignoring repeats (a reconnection may resend the last one). */
export function addEvent(events: readonly TraceEvent[], incoming: TraceEvent): TraceEvent[] {
  if (events.some((e) => e.seq === incoming.seq)) return events as TraceEvent[];
  return [...events, incoming].sort((a, b) => a.seq - b.seq);
}

/** Exponential back-off with a ceiling: 1 s, 2 s, 4 s, 8 s, 15 s... */
export const reconnectDelayMs = (attempt: number) => Math.min(15_000, 1000 * 2 ** Math.max(0, attempt - 1));
export const MAX_RECONNECTS = 8;

export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'ended' | 'failed';

/** What the agent is doing right now, in words for people. */
export function liveLabel(events: readonly TraceEvent[], state: StreamState): string {
  if (state === 'failed') return 'No se pudo seguir el proceso en vivo';
  if (state === 'reconnecting') return 'Reconectando…';
  const last = events[events.length - 1];
  if (state === 'ended' || last?.type === 'final_answer') return last?.metadata.status === 'failed' ? 'La evaluación falló' : 'Terminado';
  if (!last) return 'Pensando…';
  if (last.type === 'tool_call') return 'Consultando herramienta…';
  if (last.type === 'decision') return 'Decidiendo…';
  if (last.type === 'tool_result' || last.type === 'reflection') return 'Evaluando resultados…';
  return 'Pensando…';
}

export function totalDurationMs(events: readonly TraceEvent[]): number {
  if (events.length < 2) return 0;
  const a = Date.parse(events[0].timestamp);
  const b = Date.parse(events[events.length - 1].timestamp);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, b - a) : 0;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

/** The closing answer and the decisions (and tools) that backed it. */
export function finalDecision(events: readonly TraceEvent[]) {
  const final = [...events].reverse().find((e) => e.type === 'final_answer') ?? null;
  const decisions = events.filter((e) => e.type === 'decision');
  const tools = [...new Set(events.map((e) => e.metadata.tool).filter((t): t is string => typeof t === 'string'))];
  return { final, decisions, tools };
}
