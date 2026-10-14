import { describe, expect, it } from 'vitest';
import {
  median,
  observedStatuses,
  parseBuildLog,
  parseHistory,
  renderFixtures,
  sizesOfStage,
  stepLabels,
  stepSeconds,
  wrongOrder,
} from './capture';
import { capture } from './fixtures';
import { scenarios } from './scenarios';

const goodLines = capture.variants.good.dockerfile;

/** An excerpt of `docker build --progress=plain` of the multi-stage Dockerfile, as BuildKit writes it. */
const multiLog = `#4 [dependencias 1/4] FROM docker.io/library/node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0
#4 resolve docker.io/library/node:26-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0 0.0s done
#4 DONE 0.0s

#5 [dependencias 2/4] WORKDIR /app
#5 CACHED

#6 [internal] load build context
#6 transferring context: 271.94kB 0.0s done
#6 DONE 0.0s

#7 [dependencias 3/4] COPY package.json package-lock.json .npmrc ./
#7 DONE 0.1s

#8 [final 4/5] RUN npm ci --omit=dev && npm cache clean --force
#8 DONE 4.7s

#9 [dependencias 4/4] RUN npm ci
#9 27.20 added 69 packages, and audited 70 packages in 26s
#9 DONE 18.7s

#10 [comprobar 1/2] COPY . .
#10 DONE 0.4s

#11 [comprobar 2/2] RUN npm run check
#11 DONE 1.2s

#12 [final 5/5] COPY --from=comprobar /app/src ./src
#12 DONE 0.1s

#13 exporting to image
#13 DONE 3.5s
`;

describe('wrongOrder', () => {
  it('moves COPY . . to where the manifests’ COPY was, before npm ci', () => {
    expect(wrongOrder(goodLines).slice(1, 4)).toEqual(['WORKDIR /app', 'COPY . .', 'RUN npm ci']);
    expect(wrongOrder(goodLines)).toEqual(capture.variants.wrong.dockerfile);
  });

  it('also when the manifests are copied with a pattern', () => {
    const lines = [
      'FROM node:26-slim',
      'WORKDIR /app',
      'COPY package*.json ./',
      'RUN npm ci',
      'COPY . .',
      'CMD ["node", "src/servidor.ts"]',
    ];
    expect(wrongOrder(lines)).toEqual([
      'FROM node:26-slim',
      'WORKDIR /app',
      'COPY . .',
      'RUN npm ci',
      'CMD ["node", "src/servidor.ts"]',
    ]);
  });

  it('refuses a Dockerfile without the two COPY', () => {
    expect(() => wrongOrder(['FROM node:26-slim', 'COPY . .', 'RUN npm ci'])).toThrow();
  });
});

describe('stepLabels', () => {
  it('one stage: i/n, FROM included, metadata not', () => {
    expect(stepLabels(scenarios.good.instructions)).toEqual([
      '1/5',
      '2/5',
      '3/5',
      '4/5',
      '5/5',
      null,
      null,
      null,
    ]);
  });

  it('several stages: the stage’s name; FROM another stage is not a step', () => {
    const labels = stepLabels(scenarios.multi.instructions).filter(Boolean);
    expect(labels).toEqual([
      'dependencias 1/4',
      'dependencias 2/4',
      'dependencias 3/4',
      'dependencias 4/4',
      'comprobar 1/2',
      'comprobar 2/2',
      'final 1/5',
      'final 2/5',
      'final 3/5',
      'final 4/5',
      'final 5/5',
    ]);
  });
});

describe('parseBuildLog', () => {
  it('reads the seconds of each step, and which were CACHED', () => {
    const log = parseBuildLog(multiLog);
    expect(log.get('dependencias 4/4')).toEqual({ status: 'done', seconds: 18.7 });
    expect(log.get('dependencias 2/4')).toEqual({ status: 'cached' });
    expect(log.has('final 2/5')).toBe(false);
    expect([...log.keys()]).not.toContain('internal');
  });

  it('gives a shared step the seconds of the first stage once, and 0 to the copy', () => {
    const { instructions } = scenarios.multi;
    const seconds = stepSeconds(instructions, parseBuildLog(multiLog));
    const at = (text: string, stage: string) =>
      seconds[instructions.find((i) => i.text === text && i.stage === stage)!.index];
    expect(at('RUN npm ci', 'dependencias')).toBe(18.7);
    expect(at('COPY package.json package-lock.json .npmrc ./', 'dependencias')).toBe(0.1);
    expect(at('COPY package.json package-lock.json .npmrc ./', 'final')).toBe(0);
    expect(at('ENV NODE_ENV=production HOST=0.0.0.0', 'final')).toBeNull();
  });

  it('a shared step has its status from the first stage', () => {
    const { instructions } = scenarios.multi;
    const statuses = observedStatuses(instructions, parseBuildLog(multiLog));
    const workdirs = instructions.filter((i) => i.text === 'WORKDIR /app');
    expect(workdirs.map((i) => statuses[i.index])).toEqual(['cached', 'cached']);
  });

  it('a step missing from the log is an error', () => {
    expect(() => stepSeconds(scenarios.good.instructions, parseBuildLog(multiLog))).toThrow(
      /no step/,
    );
  });
});

describe('docker history', () => {
  const output = [
    'CMD ["node" "src/servidor.ts"]\t0',
    'EXPOSE [3000/tcp]\t0',
    'ENV HOST=0.0.0.0\t0',
    'COPY . . # buildkit\t745472',
    'RUN /bin/sh -c npm ci # buildkit\t160849920',
    'COPY package.json package-lock.json .npmrc ./ # buildkit\t106496',
    'WORKDIR /app\t8192',
    'CMD ["node"]\t0',
    "# debian.sh --arch 'arm64' out/ 'trixie' '@1791158400'\t109522944",
  ].join('\n');

  it('reads the rows oldest first, with their bytes', () => {
    const rows = parseHistory(output);
    expect(rows[0]!.bytes).toBe(109522944);
    expect(rows.at(-1)!.createdBy).toBe('CMD ["node" "src/servidor.ts"]');
  });

  it('gives each instruction of a stage its row, checking the keyword', () => {
    const sizes = sizesOfStage(scenarios.good.instructions, '', parseHistory(output));
    expect(Object.fromEntries(sizes)).toEqual({
      1: 8192,
      2: 106496,
      3: 160849920,
      4: 745472,
      5: 0,
      6: 0,
      7: 0,
    });
    const shifted = parseHistory(output.split('\n').slice(1).join('\n'));
    expect(() => sizesOfStage(scenarios.good.instructions, '', shifted)).toThrow(/does not match/);
  });
});

describe('median and fixtures.ts', () => {
  it('median', () => {
    expect(median([4.4, 27.3, 4.2])).toBe(4.4);
    expect(median([1, 2])).toBe(1.5);
    expect(median([null, null])).toBeNull();
  });

  it('renders a module with the date, the machine and the data', () => {
    const text = renderFixtures(capture, 'node capture.ts a b');
    expect(text).toContain(`Captured on ${capture.date}`);
    expect(text).toContain(capture.machine);
    expect(text).toContain('export const capture: Capture = {');
  });

  it('the fixtures are real: one measure per instruction, a date and sizes for every layer', () => {
    expect(capture.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const variant of Object.values(scenarios)) {
      expect(variant.steps).toHaveLength(variant.instructions.length);
      for (const instruction of variant.instructions) {
        const step = variant.steps[instruction.index]!;
        expect(step.bytes === null).toBe(!instruction.layer);
        expect(step.seconds === null).toBe(!instruction.layer);
      }
    }
  });
});
