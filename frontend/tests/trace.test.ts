import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { addEvent, finalDecision, formatDuration, liveLabel, parseSse, reconnectDelayMs, toTraceEvent, totalDurationMs, type TraceEvent } from '../src/features/evaluations/trace';

const ev = (seq: number, type: TraceEvent['type'] = 'reflection', extra: Partial<TraceEvent> = {}): TraceEvent => ({
  id: `e${seq}`, runId: 'r', seq, timestamp: `2026-11-28T00:00:0${seq}Z`, type, title: `t${seq}`, summary: 's', metadata: {}, ...extra,
});

describe('parseSse', () => {
  it('returns complete messages and keeps the unfinished tail', () => {
    const { messages, rest } = parseSse('id: 1\nevent: trace\ndata: {"a":1}\n\nid: 2\nevent: tr');
    assert.deepEqual(messages, [{ event: 'trace', id: '1', data: '{"a":1}' }]);
    assert.equal(rest, 'id: 2\nevent: tr');
  });
  it('ignores heartbeats and handles CRLF', () => {
    const { messages } = parseSse(': heartbeat\r\n\r\nevent: end\r\ndata: {}\r\n\r\n');
    assert.deepEqual(messages, [{ event: 'end', id: null, data: '{}' }]);
  });
});

describe('toTraceEvent', () => {
  it('accepts a wire event and drops malformed or unknown ones', () => {
    assert.equal(toTraceEvent({ id: 'a', runId: 'r', seq: 1, timestamp: 't', type: 'decision', title: 'x', summary: 'y', metadata: {} })?.type, 'decision');
    assert.equal(toTraceEvent({ id: 'a', seq: 1, type: 'hack' }), null);
    assert.equal(toTraceEvent('nope'), null);
    assert.equal(toTraceEvent({ id: 'a', seq: 'x', type: 'decision' }), null);
  });
});

describe('addEvent', () => {
  it('keeps order and ignores a repeated seq after reconnecting', () => {
    let list: TraceEvent[] = [];
    for (const n of [2, 1, 2, 3]) list = addEvent(list, ev(n));
    assert.deepEqual(list.map((e) => e.seq), [1, 2, 3]);
  });
});

describe('reconnectDelayMs', () => {
  it('grows exponentially up to a ceiling', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(reconnectDelayMs), [1000, 2000, 4000, 8000, 15000, 15000]);
  });
});

describe('liveLabel', () => {
  it('says what the agent is doing from the last event', () => {
    assert.equal(liveLabel([], 'live'), 'Pensando…');
    assert.equal(liveLabel([ev(1, 'tool_call')], 'live'), 'Consultando herramienta…');
    assert.equal(liveLabel([ev(1, 'decision')], 'live'), 'Decidiendo…');
    assert.equal(liveLabel([ev(1, 'tool_result')], 'live'), 'Evaluando resultados…');
    assert.equal(liveLabel([ev(1, 'final_answer')], 'ended'), 'Terminado');
    assert.equal(liveLabel([ev(1, 'final_answer', { metadata: { status: 'failed' } })], 'ended'), 'La evaluación falló');
    assert.equal(liveLabel([ev(1)], 'reconnecting'), 'Reconectando…');
    assert.equal(liveLabel([], 'failed'), 'No se pudo seguir el proceso en vivo');
  });
});

describe('finalDecision and durations', () => {
  it('collects the closing answer, decisions and the tools used', () => {
    const events = [ev(1, 'tool_result', { metadata: { tool: 'market_search' } }), ev(2, 'decision'), ev(3, 'final_answer')];
    const out = finalDecision(events);
    assert.equal(out.final?.seq, 3);
    assert.equal(out.decisions.length, 1);
    assert.deepEqual(out.tools, ['market_search']);
    assert.equal(finalDecision([ev(1)]).final, null);
  });
  it('measures and formats time', () => {
    assert.equal(totalDurationMs([ev(1), ev(3)]), 2000);
    assert.equal(totalDurationMs([ev(1)]), 0);
    assert.deepEqual([450, 2500, 75_000].map(formatDuration), ['450 ms', '2.5 s', '1 min 15 s']);
  });
});
