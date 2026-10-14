/**
 * The lab's state: which Dockerfile, what has changed since the last build and what that build
 * did. Pure logic: narrations are keys with data, and strings.ts turns them into sentences.
 */
import { rebuild, type Build } from './cache';
import type { FileGroup } from './dockerfile';
import { totals, type Variant } from './measure';
import { base, scenarios } from './scenarios';

export type Order = 'good' | 'wrong';

/** What the reader can change: a file of `src/` or `package.json`. */
export type Change = Extract<FileGroup, 'src' | 'package.json'>;

export const changes: readonly Change[] = ['src', 'package.json'];

export type Narration =
  | { key: 'intro' }
  | { key: 'variant'; variant: Variant }
  | { key: 'changed'; change: Change; built: boolean }
  | { key: 'first-build'; seconds: number }
  | { key: 'all-cached' }
  /** Only one step ran again: `step` is its index. */
  | { key: 'rebuilt-one'; step: number; cached: number; seconds: number }
  | {
      key: 'rebuilt';
      /** Index of the first instruction that ran again. */
      first: number;
      rebuilt: number;
      cached: number;
      seconds: number;
      /** Index of the step that took longest, and its seconds. */
      slowest: number;
      slowestSeconds: number;
    };

export interface LabState {
  order: Order;
  multiStage: boolean;
  /** The last build, or `null` if this Dockerfile has not been built yet. */
  build: Build | null;
  /** What has changed since the last build. */
  pending: Change[];
  narration: Narration;
  /** How many actions so far: the live region alternates on it (lib/live-text.ts). */
  attempt: number;
}

export type Action =
  | { type: 'change'; change: Change }
  | { type: 'build' }
  | { type: 'order'; order: Order }
  | { type: 'multi-stage'; on: boolean };

export const initialState = (): LabState => ({
  order: 'good',
  multiStage: false,
  build: null,
  pending: [],
  narration: { key: 'intro' },
  attempt: 0,
});

/** The Dockerfile in use: multi-stage always has the right order. */
export const variantOf = (state: Pick<LabState, 'order' | 'multiStage'>): Variant =>
  state.multiStage ? 'multi' : state.order;

/** Another Dockerfile: its cache is not this one's, so it starts without a build. */
function switchTo(state: LabState, next: Pick<LabState, 'order' | 'multiStage'>): LabState {
  const variant = variantOf(next);
  if (variant === variantOf(state)) return { ...state, ...next };
  return {
    ...state,
    ...next,
    build: null,
    pending: [],
    narration: { key: 'variant', variant },
    attempt: state.attempt + 1,
  };
}

function runBuild(state: LabState): LabState {
  const { instructions, steps } = scenarios[variantOf(state)];
  const build = rebuild(instructions, state.pending, state.build ?? undefined);
  const sums = totals(instructions, steps, base.bytes, build);
  let narration: Narration;
  if (!state.build) narration = { key: 'first-build', seconds: sums.seconds };
  else if (sums.rebuilt === 0) narration = { key: 'all-cached' };
  else {
    const ran = instructions.filter((i) => build[i.index] === 'rebuilt' && i.sameAs === undefined);
    if (ran.length === 1) {
      narration = {
        key: 'rebuilt-one',
        step: ran[0]!.index,
        cached: sums.cached,
        seconds: sums.seconds,
      };
    } else {
      const slowest = ran.reduce((a, b) =>
        (steps[b.index]!.seconds ?? 0) > (steps[a.index]!.seconds ?? 0) ? b : a,
      );
      narration = {
        key: 'rebuilt',
        first: ran[0]!.index,
        rebuilt: sums.rebuilt,
        cached: sums.cached,
        seconds: sums.seconds,
        slowest: slowest.index,
        slowestSeconds: steps[slowest.index]!.seconds ?? 0,
      };
    }
  }
  return { ...state, build, pending: [], narration, attempt: state.attempt + 1 };
}

export function reduce(state: LabState, action: Action): LabState {
  switch (action.type) {
    case 'change':
      return {
        ...state,
        pending: changes.filter((c) => c === action.change || state.pending.includes(c)),
        narration: { key: 'changed', change: action.change, built: state.build !== null },
        attempt: state.attempt + 1,
      };
    case 'build':
      return runBuild(state);
    case 'order':
      return switchTo(state, { order: action.order, multiStage: state.multiStage });
    case 'multi-stage':
      return switchTo(state, { order: state.order, multiStage: action.on });
  }
}
