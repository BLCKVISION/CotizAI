import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildJourney } from '../src/features/home/journey';

const project = (id: string, estado = 'en_recepcion') => ({ id, nombre: `P-${id}`, estado });

describe('buildJourney', () => {
  it('cargador without projects: create is the only action', () => {
    const j = buildJourney('cargador', [], {});
    assert.equal(j.cta?.path, '/proyectos/nuevo');
    assert.deepEqual(j.steps.map((s) => s.state), ['current', 'pending', 'pending']);
  });
  it('cargador with 2 proposals: upload is next and shows the counter', () => {
    const j = buildJourney('cargador', [project('a')], { a: 2 });
    assert.equal(j.cta?.label, 'Cargar propuestas');
    assert.equal(j.steps[1].state, 'current');
    assert.match(j.steps[1].detail, /2 de 3/);
  });
  it('cargador with 3 proposals: evaluation is shown but locked', () => {
    const j = buildJourney('cargador', [project('a')], { a: 3 });
    assert.deepEqual(j.steps.map((s) => s.state), ['done', 'done', 'blocked']);
  });
  it('focus is the newest project still in reception', () => {
    const j = buildJourney('evaluador', [project('x', 'cerrado'), project('y')], {});
    assert.equal(j.focus?.id, 'y');
    assert.equal(j.cta?.path, '/proyectos/y');
  });
  it('reviewers without projects get a note instead of an action', () => {
    const j = buildJourney('aprobador', [], {});
    assert.equal(j.cta, null);
    assert.ok(j.note.length > 0);
  });
  it('auditor goes to the audit log', () => {
    assert.equal(buildJourney('auditor', [project('a')], {}).cta?.path, '/auditoria');
  });
});
