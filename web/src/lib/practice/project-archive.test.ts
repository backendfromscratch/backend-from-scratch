import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { stepEntries, tarGz } from './project-archive';

const work = mkdtempSync(join(tmpdir(), 'project-archive-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

/** A small step folder on disk, with what must be left out. */
function fakeStep(): string {
  const step = join(work, 'paso');
  mkdirSync(join(step, 'src'), { recursive: true });
  mkdirSync(join(step, 'test'), { recursive: true });
  mkdirSync(join(step, 'node_modules', 'hono'), { recursive: true });
  writeFileSync(join(step, 'package.json'), '{"name":"tienda-api"}\n');
  writeFileSync(
    join(step, 'src', 'app.ts'),
    "// #region saludo\nconsole.log('¡Hola, ñandú!');\n  // #endregion saludo\n",
  );
  writeFileSync(join(step, 'test', '.env'), 'LOG_LEVEL=silent\n');
  writeFileSync(join(step, '.env'), 'ADMIN_TOKEN=secreto\n');
  writeFileSync(join(step, 'node_modules', 'hono', 'index.js'), 'x');
  writeFileSync(join(step, 'grande.txt'), 'x'.repeat(1300));
  return step;
}

describe('project archives', () => {
  const step = fakeStep();
  const archive = join(work, 'paso.tar.gz');
  writeFileSync(archive, tarGz(stepEntries(step, '04-servidor-http')));

  it('the system tar lists it, under the step name, without node_modules or .env', () => {
    const listed = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
    expect(listed).toEqual([
      '04-servidor-http/',
      '04-servidor-http/grande.txt',
      '04-servidor-http/package.json',
      '04-servidor-http/src/',
      '04-servidor-http/src/app.ts',
      '04-servidor-http/test/',
      '04-servidor-http/test/.env',
    ]);
  });

  it('extracts the code without its region markers, accents and long files included', () => {
    const out = join(work, 'out');
    mkdirSync(out);
    execFileSync('tar', ['-xzf', archive, '-C', out]);
    expect(readFileSync(join(out, '04-servidor-http', 'src', 'app.ts'), 'utf8')).toBe(
      "console.log('¡Hola, ñandú!');\n",
    );
    expect(readFileSync(join(out, '04-servidor-http', 'grande.txt'), 'utf8')).toHaveLength(1300);
  });

  it('is reproducible: the same files give the same bytes', () => {
    expect(tarGz(stepEntries(step, 'x')).equals(tarGz(stepEntries(step, 'x')))).toBe(true);
  });

  it('refuses a path too long for ustar', () => {
    expect(() => tarGz([{ path: `${'a'.repeat(101)}`, content: new Uint8Array() }])).toThrow(
      'too long',
    );
  });
});
