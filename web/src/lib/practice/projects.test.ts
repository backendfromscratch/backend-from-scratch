import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectSteps } from '../../integrations/project-downloads';

// The guided projects (projects/): one per language, the same steps, the same tests and the same
// versions, so the Spanish and the English lessons explain the same code. Each step's own tests
// run in CI with Node 26 (.github/workflows/ci.yml, "guided projects").

const root = resolve(process.cwd(), '..', 'projects');
const languages = { es: 'tienda-api', en: 'shop-api' } as const;
const steps = projectSteps(root);
const stepsOf = (project: string) => steps.filter((s) => s.project === project).map((s) => s.step);
const number = (step: string) => step.slice(0, 2);
const read = (project: string, step: string, file: string) =>
  readFileSync(join(root, project, step, file), 'utf8');
const json = (project: string, step: string) => JSON.parse(read(project, step, 'package.json'));

/** The number of tests in a step: `test(` calls in its test folder. */
function testCount(project: string, step: string): number {
  const dir = join(root, project, step, 'test');
  return readdirSync(dir)
    .filter((file) => /\.test\.[jt]s$/.test(file))
    .reduce(
      (sum, file) => sum + (readFileSync(join(dir, file), 'utf8').match(/^test\(/gm)?.length ?? 0),
      0,
    );
}

describe('the guided projects', () => {
  it('there is one per language, and nothing else in projects/', () => {
    expect(readdirSync(root).sort()).toEqual(Object.values(languages).sort());
  });

  it('both have the same steps, numbered from 01 without gaps', () => {
    const es = stepsOf(languages.es).map(number);
    expect(stepsOf(languages.en).map(number)).toEqual(es);
    expect(es).toEqual(es.map((_, i) => String(i + 1).padStart(2, '0')));
  });

  describe.each(stepsOf(languages.es).map((step, i) => [step, stepsOf(languages.en)[i]!]))(
    '%s and %s',
    (es, en) => {
      it('have the same number of tests', () => {
        expect(testCount(languages.en, en)).toBe(testCount(languages.es, es));
        expect(testCount(languages.es, es)).toBeGreaterThan(0);
      });

      it('mark the same number of regions for the lessons', () => {
        const regions = (project: string, step: string) =>
          JSON.stringify(
            readdirSync(join(root, project, step), { recursive: true, encoding: 'utf8' })
              .filter((file) => /\.([jt]s|sql|md)$/.test(file) && !file.startsWith('node_modules'))
              .map(
                (file) => read(project, step, file).match(/(\/\/|--|<!--) #region /g)?.length ?? 0,
              )
              .reduce((sum, n) => sum + n, 0),
          );
        expect(regions(languages.en, en)).toBe(regions(languages.es, es));
      });

      it('use the same exact versions', () => {
        const versions = (project: string, step: string) => {
          const { dependencies = {}, devDependencies = {} } = json(project, step);
          return { ...dependencies, ...devDependencies };
        };
        const spanish = versions(languages.es, es);
        expect(versions(languages.en, en)).toEqual(spanish);
        for (const version of Object.values(spanish)) expect(version).toMatch(/^\d+\.\d+\.\d+$/);
      });

      it.each(Object.values(languages))(
        'in %s: waits 7 days, runs no install scripts and has a lockfile',
        (project) => {
          const step = project === languages.es ? es : en;
          const npmrc = read(project, step, '.npmrc');
          expect(npmrc).toMatch(/^min-release-age=7$/m);
          expect(npmrc).toMatch(/^ignore-scripts=true$/m);
          expect(existsSync(join(root, project, step, 'package-lock.json'))).toBe(true);
          expect(json(project, step).engines.node).toMatch(/^>=24(\.\d+\.\d+)?$/);
          // `nvm use` in the folder picks the Node version the lessons use.
          expect(read(project, step, '.nvmrc').trim()).toBe('26');
        },
      );
    },
  );
});
