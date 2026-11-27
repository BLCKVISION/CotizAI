import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bloquesDeMarkdown, partirPorInciertos } from '../src/features/transcripcion/markdown';

describe('bloquesDeMarkdown', () => {
  it('entrada vacía no produce bloques', () => {
    assert.deepEqual(bloquesDeMarkdown(''), []);
    assert.deepEqual(bloquesDeMarkdown('  \n\n '), []);
  });

  it('un encabezado da un título con su nivel', () => {
    assert.deepEqual(bloquesDeMarkdown('# Proforma\n## Detalle'), [
      { tipo: 'titulo', nivel: 1, texto: 'Proforma' },
      { tipo: 'titulo', nivel: 2, texto: 'Detalle' },
    ]);
  });

  it('una tabla con separador da cabecera y filas', () => {
    const md = '| Item | Total |\n|---|---:|\n| Monitor | 1.100,00 |\n| Mouse | 25,00 |';
    assert.deepEqual(bloquesDeMarkdown(md), [
      {
        tipo: 'tabla',
        cabecera: ['Item', 'Total'],
        filas: [
          ['Monitor', '1.100,00'],
          ['Mouse', '25,00'],
        ],
      },
    ]);
  });

  it('una fila con menos celdas se completa y con más se recorta a la cabecera', () => {
    const md = '| A | B |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |';
    const tabla = bloquesDeMarkdown(md)[0];
    assert.equal(tabla.tipo, 'tabla');
    if (tabla.tipo === 'tabla') assert.deepEqual(tabla.filas, [['1', ''], ['1', '2']]);
  });

  it('una barra escapada dentro de una celda no parte la celda', () => {
    const tabla = bloquesDeMarkdown('| A | B |\n|---|---|\n| x \\| y | 2 |')[0];
    if (tabla.tipo === 'tabla') assert.deepEqual(tabla.filas, [['x | y', '2']]);
    else assert.fail('se esperaba una tabla');
  });

  it('líneas con barras pero sin fila separadora se muestran como párrafo, sin romper', () => {
    const bloques = bloquesDeMarkdown('| Item | Total |\n| Monitor | 1.100,00 |');
    assert.equal(bloques.length, 1);
    assert.equal(bloques[0].tipo, 'parrafo');
  });

  it('una línea vacía separa párrafos', () => {
    assert.deepEqual(bloquesDeMarkdown('Primera línea\nsigue\n\nSegundo'), [
      { tipo: 'parrafo', texto: 'Primera línea\nsigue' },
      { tipo: 'parrafo', texto: 'Segundo' },
    ]);
  });

  it('mezcla título, tabla y párrafo en orden', () => {
    const md = '# P\n| A |\n|---|\n| 1 |\nNota final';
    assert.deepEqual(
      bloquesDeMarkdown(md).map((b) => b.tipo),
      ['titulo', 'tabla', 'parrafo'],
    );
  });
});

describe('partirPorInciertos', () => {
  it('marca el fragmento incierto entre texto normal', () => {
    assert.deepEqual(partirPorInciertos('Total 1.1?0,00 USD', ['1.1?0,00']), [
      { texto: 'Total ', incierto: false },
      { texto: '1.1?0,00', incierto: true },
      { texto: ' USD', incierto: false },
    ]);
  });

  it('sin inciertos devuelve un solo segmento', () => {
    assert.deepEqual(partirPorInciertos('Total 100', []), [{ texto: 'Total 100', incierto: false }]);
  });

  it('los caracteres especiales de regex en un incierto se toman literales', () => {
    assert.deepEqual(partirPorInciertos('a (1.0?) b', ['(1.0?)']), [
      { texto: 'a ', incierto: false },
      { texto: '(1.0?)', incierto: true },
      { texto: ' b', incierto: false },
    ]);
  });

  it('un incierto vacío se ignora y un incierto ausente del texto no cambia nada', () => {
    assert.deepEqual(partirPorInciertos('Total 100', ['', '999']), [{ texto: 'Total 100', incierto: false }]);
  });

  it('texto vacío no produce segmentos', () => {
    assert.deepEqual(partirPorInciertos('', ['1']), []);
  });
});
