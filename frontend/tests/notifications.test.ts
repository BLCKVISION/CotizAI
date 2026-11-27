import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildNotifications } from '../src/features/notifications/build';

const project = (id: string, estado: string, creado = '2026-11-27T10:00:00Z') => ({ id, nombre: `P-${id}`, estado, creado });

describe('buildNotifications', () => {
  it('says how many proposals are missing', () => {
    const [n] = buildNotifications([project('a', 'en_recepcion')], { a: 2 });
    assert.equal(n.title, 'Faltan propuestas');
    assert.match(n.detail, /falta 1 para evaluar/);
  });
  it('announces a project that is ready to evaluate', () => {
    assert.equal(buildNotifications([project('a', 'en_recepcion')], { a: 3 })[0].tone, 'ready');
  });
  it('changes the id when the situation changes', () => {
    const before = buildNotifications([project('a', 'en_recepcion')], { a: 1 })[0].id;
    assert.notEqual(buildNotifications([project('a', 'en_recepcion')], { a: 2 })[0].id, before);
  });
  it('lists the newest project first and skips closed ones', () => {
    const list = buildNotifications([project('old', 'adjudicado', '2026-11-01'), project('x', 'cerrado'), project('new', 'en_revision_del_comite', '2026-11-20')], {});
    assert.deepEqual(list.map((n) => n.projectId), ['new', 'old']);
  });
});
