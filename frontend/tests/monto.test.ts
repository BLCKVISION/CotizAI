import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parsearMonto } from '../src/core/amount';

describe('parsearMonto', () => {
  const validos: [string, number][] = [
    ['1500', 1500], ['1.500', 1500], ['1.500,50', 1500.5], ['1,500.50', 1500.5], ['12,5', 12.5],
    ['12.5', 12.5], ['1.500.000', 1500000], ['0,99', 0.99], [' 2 500 ', 2500],
  ];
  for (const [entrada, esperado] of validos) {
    it(`"${entrada}" → ${esperado}`, () => assert.equal(parsearMonto(entrada), esperado));
  }
  for (const malo of ['', 'abc', 'Infinity', '1e5', '0x10', '-5', '1,2,3', '12,', '1.500,5x']) {
    it(`rechaza "${malo}"`, () => assert.equal(parsearMonto(malo), null));
  }
});
