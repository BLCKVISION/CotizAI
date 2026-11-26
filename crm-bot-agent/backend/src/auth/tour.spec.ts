import { describe, expect, it } from 'vitest';
import { TOUR_VERSION, tourState } from './tour.js';

describe('tourState', () => {
  it('cuenta nueva: necesita el tour', () => {
    expect(tourState({ tourStatus: null, tourCompletedAt: null, tourVersion: 0 })).toEqual({ tourStatus: null, tourCompletedAt: null, needsTour: true });
  });
  it('completado o saltado con la versión actual: no lo necesita', () => {
    const at = new Date();
    expect(tourState({ tourStatus: 'completed', tourCompletedAt: at, tourVersion: TOUR_VERSION }).needsTour).toBe(false);
    expect(tourState({ tourStatus: 'skipped', tourCompletedAt: at, tourVersion: TOUR_VERSION }).needsTour).toBe(false);
  });
  it('si sube la versión del tour vuelve a mostrarse', () => {
    expect(tourState({ tourStatus: 'completed', tourCompletedAt: new Date(), tourVersion: TOUR_VERSION - 1 }).needsTour).toBe(true);
  });
});
