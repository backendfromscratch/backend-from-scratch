import { describe, expect, it } from 'vitest';
import {
  displayText,
  inFinalImage,
  instructionLines,
  parseDockerfile,
  stagesOf,
  type Instruction,
} from './dockerfile';
import { scenarios } from './scenarios';

const parse = (source: string) => parseDockerfile(instructionLines(source));
const byText = (instructions: Instruction[], text: string) =>
  instructions.find((i) => i.text === text)!;

const single = parse(`
# The base image
FROM node:26-slim
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "src/servidor.ts"]
`);

describe('instructionLines', () => {
  it('drops comments and blank lines, and joins the lines that end in a backslash', () => {
    expect(
      instructionLines(
        '# a comment\n\nFROM node:26-slim\nRUN apt-get update \\\n  # inside\n  && apt-get install -y curl\n',
      ),
    ).toEqual(['FROM node:26-slim', 'RUN apt-get update && apt-get install -y curl']);
  });
});

describe('parseDockerfile', () => {
  it('reads each instruction’s kind and text', () => {
    expect(single.map((i) => i.kind)).toEqual([
      'FROM',
      'WORKDIR',
      'COPY',
      'RUN',
      'COPY',
      'ENV',
      'EXPOSE',
      'CMD',
    ]);
    expect(single[2]!.text).toBe('COPY package.json package-lock.json .npmrc ./');
  });

  it('only WORKDIR, COPY and RUN add a layer: the rest is metadata, 0 bytes in docker history', () => {
    expect(single.filter((i) => i.layer).map((i) => i.kind)).toEqual([
      'WORKDIR',
      'COPY',
      'RUN',
      'COPY',
    ]);
    const multi = scenarios.multi.instructions;
    for (const kind of ['USER', 'HEALTHCHECK', 'ENV', 'EXPOSE', 'CMD', 'FROM'] as const) {
      expect(multi.filter((i) => i.kind === kind).every((i) => !i.layer)).toBe(true);
    }
  });

  it('the manifests’ COPY takes them and .npmrc, not src/; COPY . . takes everything', () => {
    expect(single[2]!.files).toEqual(['package.json', 'package-lock.json', '.npmrc']);
    expect(single[4]!.files).toEqual([
      'src',
      'package.json',
      'package-lock.json',
      '.npmrc',
      'other',
    ]);
    expect(single[3]!.files).toEqual([]);
  });

  it('other sources: one file, a pattern, a folder, the other files', () => {
    const parsed = parse(
      'FROM node:26-slim\nCOPY package.json ./\nCOPY package*.json ./\nCOPY .npmrc ./\nCOPY src ./src\nCOPY tsconfig.json drizzle ./\n',
    );
    expect(parsed.map((i) => i.files)).toEqual([
      [],
      ['package.json'],
      ['package.json', 'package-lock.json'],
      ['.npmrc'],
      ['src'],
      ['other'],
    ]);
  });

  it('COPY --from takes what that stage has, relative to its WORKDIR', () => {
    const parsed = parse(`
FROM node:26-slim AS dependencias
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
FROM node:26-slim
COPY --from=dependencias /app/src ./src
COPY --from=dependencias /app/node_modules ./node_modules
COPY --from=dependencias /app ./
`);
    expect(parsed.slice(-3).map((i) => [i.from, i.files])).toEqual([
      ['dependencias', ['src']],
      ['dependencias', ['package.json', 'package-lock.json', '.npmrc']],
      ['dependencias', ['src', 'package.json', 'package-lock.json', '.npmrc', 'other']],
    ]);
  });

  it('names the stages as BuildKit does: none with one stage, stage-N without AS', () => {
    expect(new Set(single.map((i) => i.stage))).toEqual(new Set(['']));
    const parsed = parse('FROM node:26-slim\nRUN true\nFROM node:26-slim AS final\nRUN false\n');
    expect(parsed.map((i) => i.stage)).toEqual(['stage-0', 'stage-0', 'final', 'final']);
  });

  it('marks the steps BuildKit shares between stages: same image and same steps before', () => {
    const multi = scenarios.multi.instructions;
    const shared = multi.filter((i) => i.sameAs !== undefined);
    expect(shared.map((i) => [i.text, multi[i.sameAs!]!.stage])).toEqual([
      ['WORKDIR /app', 'dependencias'],
      ['COPY package.json package-lock.json .npmrc ./', 'dependencias'],
    ]);
    expect(
      byText(multi, 'RUN npm ci --omit=dev && npm cache clean --force').sameAs,
    ).toBeUndefined();
  });

  it('a RUN with a different environment before it is not the same step', () => {
    const parsed = parse(
      'FROM node:26-slim AS a\nRUN npm ci\nFROM node:26-slim AS b\nENV NODE_ENV=production\nRUN npm ci\n',
    );
    expect(parsed[4]!.sameAs).toBeUndefined();
    const same = parse('FROM node:26-slim AS a\nRUN npm ci\nFROM node:26-slim AS b\nRUN npm ci\n');
    expect(same[3]!.sameAs).toBe(1);
  });

  it('refuses what is not a Dockerfile instruction', () => {
    expect(() => parse('FROM node:26-slim\nCOPYY . .\n')).toThrow(/COPYY/);
  });
});

describe('stagesOf and inFinalImage', () => {
  it('one stage: everything reaches the image', () => {
    expect(stagesOf(single)).toHaveLength(1);
    expect(inFinalImage(single).every(Boolean)).toBe(true);
  });

  it('multi-stage: only the last stage reaches the image', () => {
    const multi = scenarios.multi.instructions;
    const stages = stagesOf(multi);
    expect(stages.map((s) => [s.name, s.fromStage, s.final])).toEqual([
      ['dependencias', false, false],
      ['comprobar', true, false],
      ['final', false, true],
    ]);
    const kept = inFinalImage(multi);
    expect(multi.filter((i) => kept[i.index]).every((i) => i.stage === 'final')).toBe(true);
    expect(kept[byText(multi, 'RUN npm ci').index]).toBe(false);
  });

  it('a final stage that starts FROM another stage carries that stage’s layers', () => {
    const parsed = parse('FROM node:26-slim AS a\nRUN npm ci\nFROM a AS b\nRUN npm test\n');
    expect(inFinalImage(parsed)).toEqual([true, true, true, true]);
  });
});

describe('displayText', () => {
  it('shortens a digest to its first 12 characters', () => {
    expect(displayText(`FROM node:26-slim@sha256:${'ab'.repeat(32)} AS final`)).toBe(
      'FROM node:26-slim@sha256:abababababab… AS final',
    );
  });
});
