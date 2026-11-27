import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildTasks, pickFocus } from '../src/features/home/tasks';

const project = (id: string, estado = 'en_recepcion', creado = '2026-11-27T10:00:00Z') => ({ id, nombre: `P-${id}`, estado, creado });

describe('buildTasks', () => {
  it('cargador is asked for the missing proposals of each project', () => {
    const [task] = buildTasks('cargador', [project('a')], { a: 2 });
    assert.equal(task.title, 'Subir 1 propuesta más');
    assert.equal(task.path, '/proyectos/a');
    assert.match(task.detail, /P-a/);
  });
  it('a project with enough proposals is ready to evaluate and goes before uploads', () => {
    const tasks = buildTasks('cargador', [project('new', 'en_recepcion', '2026-11-28'), project('ready', 'en_recepcion', '2026-11-01')], { ready: 3 });
    assert.deepEqual(tasks.map((t) => [t.projectId, t.kind]), [['ready', 'evaluate'], ['new', 'upload']]);
  });
  it('cargador has no task while the committee decides', () => {
    assert.deepEqual(buildTasks('cargador', [project('a', 'en_revision_del_comite'), project('b', 'adjudicado')], {}), []);
  });
  it('each committee role gets its own action and the tab where it is done', () => {
    const inReview = [project('a', 'en_revision_del_comite')];
    assert.equal(buildTasks('evaluador', inReview, {})[0].path, '/proyectos/a');
    assert.equal(buildTasks('aprobador', inReview, {})[0].path, '/proyectos/a?tab=revision');
    assert.equal(buildTasks('aprobador', [project('b', 'adjudicado')], {})[0].kind, 'close');
    assert.equal(buildTasks('auditor', inReview, {})[0].kind, 'consult');
  });
  it('closed projects never create tasks', () => {
    for (const role of ['cargador', 'evaluador', 'aprobador', 'auditor'] as const) {
      assert.deepEqual(buildTasks(role, [project('a', 'cerrado')], { a: 5 }), []);
    }
  });
});

describe('pickFocus', () => {
  it('prefers the newest project still in reception', () => {
    const list = [project('old', 'en_recepcion', '2026-11-01'), project('new', 'en_recepcion', '2026-11-20'), project('x', 'cerrado', '2026-11-27')];
    assert.equal(pickFocus(list)?.id, 'new');
    assert.equal(pickFocus([]), null);
  });
});
