import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The practice Git repository for the «Git por dentro» lesson (Phase 1): web/public/practicas/repo-tienda.sh.
// The lesson quotes its hashes, so they must be the same for every reader, whatever their Git
// version and configuration.

const script = fileURLToPath(new URL('../../../public/practicas/repo-tienda.sh', import.meta.url));

/** The hashes the lesson can quote. If the script changes on purpose, update them and the lesson. */
const HEAD = 'd3e34b65586eeb9309ba0c5a5ab8ee1a34787822';
const V1 = '99c50e1';
const FIRST_BAD = '58582d7c5fd9e26e3a2966b3f9b31d31c7aa5ea9';

const work = mkdtempSync(join(tmpdir(), 'repo-tienda-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** Runs the script in a new folder; `env` is added to a clean environment. */
function create(name: string, env: Record<string, string> = {}) {
  const cwd = join(work, name);
  mkdirSync(cwd);
  const run = spawnSync('bash', [script], {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', HOME: cwd, ...env },
  });
  return { ...run, repo: join(cwd, 'tienda') };
}

const git = (repo: string, ...args: string[]) =>
  execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', HOME: repo },
  }).trim();

// Each run starts about 70 git processes: a few seconds on macOS.
describe('repo-tienda.sh', { timeout: 30_000 }, () => {
  let repo: string;
  beforeAll(() => {
    const run = create('plain');
    expect(run.status, run.stderr).toBe(0);
    repo = run.repo;
  }, 30_000);

  it('creates 18 commits on main, with v1.0 and the same hashes for everyone', () => {
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(HEAD);
    expect(git(repo, 'rev-list', '--count', 'HEAD')).toBe('18');
    expect(git(repo, 'branch', '--show-current')).toBe('main');
    expect(git(repo, 'rev-parse', '--short', 'v1.0')).toBe(V1);
    expect(git(repo, 'status', '--porcelain')).toBe('');
    expect(git(repo, 'shortlog', '-sn', 'HEAD')).toMatch(/^10\tAna García\n\s+8\tLuis Pérez$/);
  });

  it('gives the same hashes with a hostile Git configuration', () => {
    // Signed commits, a hook that fails, CRLF conversion, another branch and another author.
    const home = join(work, 'hostile-home');
    mkdirSync(join(home, 'hooks'), { recursive: true });
    writeFileSync(join(home, 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    writeFileSync(
      join(home, 'gitconfig'),
      `[init]\n\tdefaultBranch = master\n[commit]\n\tgpgsign = true\n[core]\n\tautocrlf = true\n\thooksPath = ${join(home, 'hooks')}\n[user]\n\tname = Someone Else\n\temail = else@example.org\n`,
    );
    const run = create('hostile', {
      GIT_CONFIG_GLOBAL: join(home, 'gitconfig'),
      GIT_AUTHOR_NAME: 'Someone Else',
      GIT_COMMITTER_DATE: '2020-01-01T00:00:00',
    });
    expect(run.status, run.stderr).toBe(0);
    expect(git(run.repo, 'rev-parse', 'HEAD')).toBe(HEAD);
  });

  it('the tests pass at v1.0 and fail on main, only for a 50 € order', () => {
    const check = (ref: string) => {
      git(repo, 'checkout', '-q', ref);
      return spawnSync(join(repo, 'comprobar.sh'), { cwd: repo, encoding: 'utf8' });
    };
    const good = check('v1.0');
    const bad = check('main');
    expect(good.status).toBe(0);
    expect(bad.status).toBe(1);
    expect(bad.stdout.match(/^MAL .*$/gm)).toEqual([
      'MAL   ./precio.sh 50: esperaba «Total: 60,50 €» y salió «Total: 65,50 €»',
    ]);
  });

  it('git bisect run finds the commit that broke it', () => {
    git(repo, 'bisect', 'start', 'main', 'v1.0');
    git(repo, 'bisect', 'run', './comprobar.sh');
    // Where Git prints «… is the first bad commit» (stdout or stderr) depends on its version:
    // the ref it leaves is the same in all of them.
    const found = git(repo, 'rev-parse', 'refs/bisect/bad');
    git(repo, 'bisect', 'reset');
    expect(found).toBe(FIRST_BAD);
    expect(git(repo, 'log', '-1', '--format=%s', FIRST_BAD)).toBe(
      'Ordena el código y añade comentarios',
    );
  });

  it('does not touch a folder that already exists', () => {
    const cwd = join(work, 'exists');
    mkdirSync(join(cwd, 'tienda'), { recursive: true });
    writeFileSync(join(cwd, 'tienda', 'mine.txt'), 'mine');
    const run = spawnSync('bash', [script], { cwd, encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Ya existe «tienda»');
    expect(readdirSync(join(cwd, 'tienda'))).toEqual(['mine.txt']);
  });
});
