/**
 * Docker's build cache: which steps a build reuses and which it runs again. Pure logic, no texts.
 * Spec: docs/specs/2026-10-14-phase-7-design.md (§4).
 *
 * The rule, step by step and in order: a step is reused if the step before it was reused and its
 * own inputs have not changed. For a `COPY`, its inputs are the content of the files it takes;
 * for a `RUN` or a `WORKDIR`, its text, which is the same in every build. Once one step runs
 * again, every step after it in the same stage runs again too, even if nothing of its own changed:
 * it starts from a different layer.
 */
import { stagesOf, type FileGroup, type Instruction } from './dockerfile';

export type Status = 'cached' | 'rebuilt';

/**
 * The result of a build, one entry per instruction. `null` for the ones that are not a build step:
 * metadata instructions (`ENV`, `EXPOSE`, `CMD`…) and `FROM`, whose image is downloaded once and
 * never rebuilt.
 */
export type Build = (Status | null)[];

/** Whether an instruction is a step BuildKit runs: the ones that write to the filesystem. */
export const isStep = (instruction: Instruction): boolean => instruction.layer;

/**
 * Builds again after `changed` files have changed since `previous`. Without a previous build there
 * is no cache, and every step runs.
 */
export function rebuild(
  instructions: readonly Instruction[],
  changed: readonly FileGroup[],
  previous?: Build,
): Build {
  const result: Build = instructions.map(() => null);
  const stages = stagesOf(instructions);
  /** Status of the last step of each stage: what a stage that starts from it inherits. */
  const stageEnd = new Map<string, Status>();
  for (const stage of stages) {
    let parent: Status = stage.fromStage ? (stageEnd.get(stage.base) ?? 'cached') : 'cached';
    for (const index of stage.instructions) {
      const instruction = instructions[index]!;
      if (!isStep(instruction)) continue;
      let status: Status;
      if (instruction.sameAs !== undefined) status = result[instruction.sameAs]!;
      else if (!previous) status = 'rebuilt';
      else {
        const inputsChanged = instruction.files.some((group) => changed.includes(group));
        status = parent === 'cached' && !inputsChanged ? 'cached' : 'rebuilt';
      }
      result[index] = status;
      parent = status;
    }
    stageEnd.set(stage.name, parent);
  }
  return result;
}
