import { describe, expect, it } from 'vitest';
import { rebuild, type Build } from './cache';
import type { Instruction } from './dockerfile';
import { scenarios } from './scenarios';

/** The texts of the steps with `status`, in order. */
const withStatus = (instructions: Instruction[], build: Build, status: 'cached' | 'rebuilt') =>
  instructions.filter((i) => build[i.index] === status).map((i) => `${i.stage} ${i.text}`.trim());

const first = (instructions: Instruction[]) => rebuild(instructions, []);

/** The COPY of what npm ci needs, as the real Dockerfiles write it. */
const manifests = 'COPY package.json package-lock.json .npmrc ./';

describe('rebuild', () => {
  it('the first build has no cache: every step runs; metadata and FROM are not steps', () => {
    const { instructions } = scenarios.good;
    const build = first(instructions);
    expect(withStatus(instructions, build, 'rebuilt')).toEqual([
      'WORKDIR /app',
      manifests,
      'RUN npm ci',
      'COPY . .',
    ]);
    expect(instructions.filter((i) => build[i.index] === null).map((i) => i.kind)).toEqual([
      'FROM',
      'ENV',
      'EXPOSE',
      'CMD',
    ]);
  });

  it('nothing changed: every step is reused', () => {
    const { instructions } = scenarios.good;
    const build = rebuild(instructions, [], first(instructions));
    expect(withStatus(instructions, build, 'rebuilt')).toEqual([]);
  });

  it('right order, a change in src/: only COPY . . runs again; npm ci is reused', () => {
    const { instructions } = scenarios.good;
    const build = rebuild(instructions, ['src'], first(instructions));
    expect(withStatus(instructions, build, 'rebuilt')).toEqual(['COPY . .']);
  });

  it('right order, a change in package.json: from the manifests’ COPY onwards', () => {
    const { instructions } = scenarios.good;
    const build = rebuild(instructions, ['package.json'], first(instructions));
    expect(withStatus(instructions, build, 'cached')).toEqual(['WORKDIR /app']);
    expect(withStatus(instructions, build, 'rebuilt')).toEqual([
      manifests,
      'RUN npm ci',
      'COPY . .',
    ]);
  });

  it.each(['src', 'package.json'] as const)(
    'wrong order, a change in %s: from COPY . . onwards, npm ci included',
    (change) => {
      const { instructions } = scenarios.wrong;
      const build = rebuild(instructions, [change], first(instructions));
      expect(withStatus(instructions, build, 'rebuilt')).toEqual(['COPY . .', 'RUN npm ci']);
    },
  );

  it('multi-stage, a change in src/: the dependencies are reused, the check and the source run again', () => {
    const { instructions } = scenarios.multi;
    const build = rebuild(instructions, ['src'], first(instructions));
    expect(withStatus(instructions, build, 'cached')).toEqual([
      'dependencias WORKDIR /app',
      `dependencias ${manifests}`,
      'dependencias RUN npm ci',
      'final WORKDIR /app',
      `final ${manifests}`,
      'final RUN npm ci --omit=dev && npm cache clean --force',
    ]);
    expect(withStatus(instructions, build, 'rebuilt')).toEqual([
      'comprobar COPY . .',
      'comprobar RUN npm run check',
      'final COPY --from=comprobar /app/src ./src',
    ]);
  });

  it('multi-stage, a change in package.json: both npm ci run again, and what follows them', () => {
    const { instructions } = scenarios.multi;
    const build = rebuild(instructions, ['package.json'], first(instructions));
    expect(withStatus(instructions, build, 'cached')).toEqual([
      'dependencias WORKDIR /app',
      'final WORKDIR /app',
    ]);
    expect(withStatus(instructions, build, 'rebuilt')).toEqual([
      `dependencias ${manifests}`,
      'dependencias RUN npm ci',
      'comprobar COPY . .',
      'comprobar RUN npm run check',
      `final ${manifests}`,
      'final RUN npm ci --omit=dev && npm cache clean --force',
      'final COPY --from=comprobar /app/src ./src',
    ]);
  });

  it('a stage that starts FROM another one runs again when that one did', () => {
    const { instructions } = scenarios.multi;
    const build = rebuild(instructions, ['package.json'], first(instructions));
    const check = instructions.find((i) => i.text === 'RUN npm run check')!;
    expect(build[check.index]).toBe('rebuilt');
  });
});

describe('rebuild matches what real Docker did (fixtures.ts)', () => {
  it.each(['good', 'wrong', 'multi'] as const)('%s', (variant) => {
    const { instructions, observed } = scenarios[variant];
    const afterSrc = rebuild(instructions, ['src'], first(instructions));
    expect(afterSrc).toEqual(observed.src);
    expect(rebuild(instructions, ['package.json'], afterSrc)).toEqual(observed.package);
  });
});
