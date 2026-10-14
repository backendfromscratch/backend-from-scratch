import { describe, expect, it } from 'vitest';
import { initialState, reduce, variantOf, type Action, type LabState } from './lab-state';
import { scenarios } from './scenarios';

const play = (...actions: Action[]): LabState => actions.reduce(reduce, initialState());
const build: Action = { type: 'build' };
const changeSrc: Action = { type: 'change', change: 'src' };
const changePackage: Action = { type: 'change', change: 'package.json' };

describe('lab state', () => {
  it('starts with the right order, one stage and nothing built', () => {
    const state = initialState();
    expect(variantOf(state)).toBe('good');
    expect(state.build).toBeNull();
    expect(state.narration).toEqual({ key: 'intro' });
  });

  it('the first build runs everything', () => {
    const state = play(build);
    expect(state.narration.key).toBe('first-build');
    expect(state.build?.filter((s) => s === 'rebuilt')).toHaveLength(4);
  });

  it('a change waits for the next build, which empties the list', () => {
    const changed = play(build, changeSrc, changePackage, changeSrc);
    expect(changed.pending).toEqual(['src', 'package.json']);
    expect(changed.narration).toEqual({ key: 'changed', change: 'src', built: true });
    expect(reduce(changed, build).pending).toEqual([]);
  });

  it('building again without changes reuses everything', () => {
    expect(play(build, build).narration).toEqual({ key: 'all-cached' });
  });

  it('a change in src/ with the right order: only COPY . . runs again', () => {
    const { narration } = play(build, changeSrc, build);
    const copy = scenarios.good.instructions.find((i) => i.text === 'COPY . .')!;
    expect(narration).toMatchObject({ key: 'rebuilt-one', step: copy.index, cached: 3 });
  });

  it('a change in package.json: from the manifests’ COPY, and npm ci is the slowest', () => {
    const { narration } = play(build, changePackage, build);
    const [copy, npm] = scenarios.good.instructions.slice(2, 4);
    expect(narration).toMatchObject({
      key: 'rebuilt',
      first: copy!.index,
      slowest: npm!.index,
      rebuilt: 3,
      cached: 1,
    });
  });

  it('the wrong order: a change in src/ runs npm ci again, and that is the slowest', () => {
    const { narration } = play({ type: 'order', order: 'wrong' }, build, changeSrc, build);
    const npm = scenarios.wrong.instructions.find((i) => i.text === 'RUN npm ci')!;
    expect(narration).toMatchObject({ key: 'rebuilt', slowest: npm.index, rebuilt: 2 });
  });

  it('switching the Dockerfile starts without a build', () => {
    const state = play(build, changeSrc, { type: 'multi-stage', on: true });
    expect(variantOf(state)).toBe('multi');
    expect(state.build).toBeNull();
    expect(state.pending).toEqual([]);
    expect(state.narration).toEqual({ key: 'variant', variant: 'multi' });
  });

  it('multi-stage always uses the right order; turning it off goes back to the chosen order', () => {
    const state = play({ type: 'order', order: 'wrong' }, { type: 'multi-stage', on: true });
    expect(variantOf(state)).toBe('multi');
    expect(variantOf(reduce(state, { type: 'multi-stage', on: false }))).toBe('wrong');
  });

  it('every action counts, so the live region announces a repeated sentence', () => {
    expect(play(build, build, build).attempt).toBe(3);
  });
});
