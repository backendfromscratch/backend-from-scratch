/**
 * The lab's three Dockerfiles, read and joined with their real measures (fixtures.ts).
 */
import type { Status } from './cache';
import { parseDockerfile, type Instruction } from './dockerfile';
import { capture } from './fixtures';
import { variants, type StepMeasure, type Variant } from './measure';

export interface Scenario {
  variant: Variant;
  instructions: Instruction[];
  steps: StepMeasure[];
  /** What real Docker did when building again (see measure.ts, `VariantCapture`). */
  observed: { src: (Status | null)[]; package: (Status | null)[] };
}

export const base = capture.base;

export const scenarios = Object.fromEntries(
  variants.map((variant) => {
    const { dockerfile, steps, observed } = capture.variants[variant];
    return [variant, { variant, instructions: parseDockerfile(dockerfile), steps, observed }];
  }),
) as Record<Variant, Scenario>;
