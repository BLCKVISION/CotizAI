import assert from 'node:assert/strict';
import { test } from 'node:test';

import { alertText, backgroundLabel, matchesSearch, type SupplierEntry } from '../src/core/suppliers';

const participation = (verdict: string) => ({
  project_id: 'p', project_name: 'Laboratorio', filename: 'a.pdf', verdict, position: 1, competitors: 3,
  cost: '10.00', currency: 'USD', evaluated_at: '2026-11-27T10:00:00-04:00', causes: [],
});

const supplier = (verdicts: string[], alerts: SupplierEntry['alerts'] = []): SupplierEntry => ({
  key: 'alfa', name: 'Alfa C.A.', registration: null, participations: verdicts.map(participation), alerts,
});

test('the card says first whether the supplier was discarded before', () => {
  assert.deepEqual(backgroundLabel(supplier([])), { tone: 'neutro', text: 'Sin participaciones' });
  assert.deepEqual(backgroundLabel(supplier(['valida'])), { tone: 'info', text: '1 participación' });
  assert.equal(backgroundLabel(supplier(['valida', 'descartada', 'descartada'])).text, 'Descartado 2 veces');
  const tampering = supplier(['descartada'], [{ code: 'MANIPULACION', times: 1 }]);
  assert.equal(backgroundLabel(tampering).text, 'Intentó manipular la evaluación');
});

test('alerts are worded for people and the search covers name and tax id', () => {
  assert.equal(alertText({ code: 'ARITMETICA', times: 2 }), 'Errores de cálculo (2 veces)');
  const registered = { ...supplier([]), registration: { id: '1', tax_id: 'J-123', location: 'Caracas', contact: 'x' } };
  assert.ok(matchesSearch(registered, 'j-123') && matchesSearch(registered, ' alfa ') && !matchesSearch(registered, 'beta'));
});
