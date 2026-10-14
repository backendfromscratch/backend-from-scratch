/**
 * The real measures of the lab (sizes from `docker history`, seconds from `docker build`) and the
 * totals of a build. Pure logic, no texts. The data comes from fixtures.ts, written by capture.ts.
 */
import { isStep, type Build, type Status } from './cache';
import { inFinalImage, type Instruction } from './dockerfile';

/** The three Dockerfiles of the lab: the right order, the wrong order and multi-stage. */
export type Variant = 'good' | 'wrong' | 'multi';

export const variants: readonly Variant[] = ['good', 'wrong', 'multi'];

/** What was measured for one instruction. `null` where it does not apply. */
export interface StepMeasure {
  /** Size of its layer in bytes (`docker history`); `null` if it adds no layer. */
  bytes: number | null;
  /** Seconds its step took in a build without cache (`#N DONE 27.3s`); `null` if it is not a step. */
  seconds: number | null;
}

/** One Dockerfile, as built and measured. */
export interface VariantCapture {
  /** Its instructions, without comments. */
  dockerfile: string[];
  /** One per instruction. */
  steps: StepMeasure[];
  /**
   * What Docker did when building again, one per instruction: after changing a file of `src/`, and
   * then after changing `package.json`. The tests check that cache.ts reaches the same result.
   */
  observed: { src: (Status | null)[]; package: (Status | null)[] };
}

export interface Capture {
  /** When, with what and on which machine. */
  date: string;
  docker: string;
  machine: string;
  /** The base image: its reference, how many layers and how many bytes. */
  base: { image: string; layers: number; bytes: number };
  variants: Record<Variant, VariantCapture>;
}

export interface Totals {
  /** Size of the final image: the base plus its own layers. */
  imageBytes: number;
  baseBytes: number;
  /** The final image's own layers, without the base. */
  ownBytes: number;
  /** Layers of build stages that do not reach the final image (multi-stage). */
  leftOutBytes: number;
  /** Seconds of the steps this build ran. */
  seconds: number;
  /** Steps run and reused; a step shared by two stages counts once. */
  rebuilt: number;
  cached: number;
}

/**
 * The totals of a build of `instructions` with their measures. Without a build, sizes only.
 * The seconds are the sum of the steps: BuildKit runs independent stages at the same time, so a
 * multi-stage build takes less on the clock.
 */
export function totals(
  instructions: readonly Instruction[],
  steps: readonly StepMeasure[],
  baseBytes: number,
  build: Build | null,
): Totals {
  const kept = inFinalImage(instructions);
  // A build stage's layer that the final stage shares (same step) does reach the image.
  const shared = new Set(
    instructions.filter((i) => kept[i.index] && i.sameAs !== undefined).map((i) => i.sameAs),
  );
  let ownBytes = 0;
  let leftOutBytes = 0;
  let seconds = 0;
  let rebuilt = 0;
  let cached = 0;
  for (const instruction of instructions) {
    const measure = steps[instruction.index]!;
    if (instruction.layer) {
      if (kept[instruction.index]) ownBytes += measure.bytes ?? 0;
      else if (!shared.has(instruction.index)) leftOutBytes += measure.bytes ?? 0;
    }
    const status = build?.[instruction.index];
    // A step shared by two stages runs once: it counts once.
    if (!isStep(instruction) || !status || instruction.sameAs !== undefined) continue;
    if (status === 'cached') cached += 1;
    else {
      rebuilt += 1;
      seconds += measure.seconds ?? 0;
    }
  }
  return {
    imageBytes: baseBytes + ownBytes,
    baseBytes,
    ownBytes,
    leftOutBytes,
    seconds: Math.round(seconds * 10) / 10,
    rebuilt,
    cached,
  };
}

export type ByteUnit = 'B' | 'kB' | 'MB' | 'GB';

/** A size in decimal units, as `docker images` and `docker history` show them. */
export function humanBytes(bytes: number): { amount: number; unit: ByteUnit } {
  if (bytes < 1000) return { amount: bytes, unit: 'B' };
  if (bytes < 1e6) return { amount: Math.round(bytes / 100) / 10, unit: 'kB' };
  if (bytes < 1e9) return { amount: Math.round(bytes / 1e5) / 10, unit: 'MB' };
  return { amount: Math.round(bytes / 1e8) / 10, unit: 'GB' };
}
