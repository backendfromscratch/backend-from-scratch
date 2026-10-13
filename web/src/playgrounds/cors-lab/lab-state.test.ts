import { describe, expect, it } from 'vitest';
import { run, scenarioIds, scenarios } from './cors';
import { initialState, reduce } from './lab-state';
import { strings } from './strings';

describe('the lab state', () => {
  it('starts with the usual error and its first step', () => {
    expect(initialState()).toEqual({
      scenario: 'usual-error',
      settings: scenarios['usual-error'],
      shown: 1,
    });
  });

  it('a scenario loads its settings and starts again', () => {
    const state = reduce({ ...initialState(), shown: 5 }, { type: 'scenario', id: 'post-json' });
    expect(state).toEqual(initialState('post-json'));
  });

  it('changing a control makes it custom and starts again', () => {
    const shown = reduce(initialState(), { type: 'all' });
    const request = reduce(shown, { type: 'request', patch: { method: 'PUT' } });
    expect(request).toMatchObject({ scenario: 'custom', shown: 1 });
    expect(request.settings.request.method).toBe('PUT');
    expect(request.settings.server).toBe(shown.settings.server);
    const server = reduce(shown, { type: 'server', patch: { allowOrigin: '*' } });
    expect(server).toMatchObject({ scenario: 'custom', shown: 1 });
    expect(server.settings.server.allowOrigin).toBe('*');
  });

  it('«Show all» reaches the end of the longest run', () => {
    const longest = Math.max(
      ...scenarioIds.map((id) => run(scenarios[id], strings.es.names).steps.length),
    );
    expect(reduce(initialState(), { type: 'all' }).shown).toBeGreaterThanOrEqual(longest);
  });

  it('a step shows one more; reset goes back to the first', () => {
    const two = reduce(initialState(), { type: 'step' });
    expect(two.shown).toBe(2);
    expect(reduce(two, { type: 'reset' }).shown).toBe(1);
  });
});
