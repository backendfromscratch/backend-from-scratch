import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractRegion, languageOf, readProjectFile } from './snippet';

const source = `import { x } from 'y';

// #region rutas
app.get('/', () => {
  // #region dentro
  return 1;
  // #endregion dentro
});
// #endregion rutas

function f() {
  // #region sangrado
  if (a) {
    b();
  }
  // #endregion sangrado
}
`;

describe('extractRegion', () => {
  it('reads SQL regions, marked with --', () => {
    const sql =
      '-- #region tabla\nCREATE TABLE t (\n  id integer\n);\n-- #endregion tabla\nSELECT 1;';
    expect(extractRegion(sql, 'tabla')).toBe('CREATE TABLE t (\n  id integer\n);');
    expect(extractRegion(sql)).toBe('CREATE TABLE t (\n  id integer\n);\nSELECT 1;');
  });

  it('reads regions in files whose comments start with #, like YAML and shell', () => {
    const yaml =
      'services:\n  # #region db\n  db:\n    image: postgres\n  # #endregion db\n  api:\n';
    expect(extractRegion(yaml, 'db')).toBe('db:\n  image: postgres');
    expect(extractRegion(yaml)).toBe('services:\n  db:\n    image: postgres\n  api:');
  });

  it('a # marker is only a whole comment line, and #regional is not one', () => {
    const yaml = 'a: 1\nkey: "# #region x"\n# #regional\nb: 2\n';
    expect(extractRegion(yaml)).toBe('a: 1\nkey: "# #region x"\n# #regional\nb: 2');
    expect(() => extractRegion(yaml, 'x')).toThrow('There is no region «x»');
  });

  it('without a region: the whole file, without the markers', () => {
    expect(extractRegion(source)).toBe(
      "import { x } from 'y';\n\napp.get('/', () => {\n  return 1;\n});\n\nfunction f() {\n  if (a) {\n    b();\n  }\n}",
    );
  });

  it('a region: its lines, without the markers of the regions inside', () => {
    expect(extractRegion(source, 'rutas')).toBe("app.get('/', () => {\n  return 1;\n});");
  });

  it('a region inside a function loses its indentation', () => {
    expect(extractRegion(source, 'sangrado')).toBe('if (a) {\n  b();\n}');
  });

  it('a region that does not exist, appears twice or is not closed: an error', () => {
    expect(() => extractRegion(source, 'nada')).toThrow('There is no region «nada»');
    expect(() => extractRegion(`${source}// #region rutas\n`, 'rutas')).toThrow('appears twice');
    expect(() => extractRegion('// #region a\nx\n', 'a')).toThrow('never closed');
  });

  it('does not take a region whose name only starts like another', () => {
    expect(() =>
      extractRegion('// #region rutas-extra\nx\n// #endregion rutas-extra\n', 'rutas'),
    ).toThrow('There is no region');
  });
});

describe('languageOf', () => {
  it('from the extension, and dot files as ini', () => {
    expect(languageOf('a/src/app.ts')).toBe('ts');
    expect(languageOf('a/package.json')).toBe('json');
    expect(languageOf('a/tsconfig.json')).toBe('jsonc');
    expect(languageOf('a/ejemplos/pedido.proto')).toBe('proto');
    expect(languageOf('a/bd/migraciones/002-stock.sql')).toBe('sql');
    expect(languageOf('a/33-imagen-pequena/Dockerfile')).toBe('dockerfile');
    expect(languageOf('a/34-compose/compose.yaml')).toBe('yaml');
    expect(languageOf('a/34-compose/.dockerignore')).toBe('ini');
    expect(languageOf('a/.npmrc')).toBe('ini');
    expect(languageOf('a/despliegue/tienda-copia.service')).toBe('ini');
    expect(languageOf('a/despliegue/tienda-copia.timer')).toBe('ini');
    expect(languageOf('a/nginx/tienda.conf')).toBe('nginx');
    expect(languageOf('a/docs/postmortem.md')).toBe('md');
    expect(() => languageOf('a/otra.conf')).toThrow();
    expect(() => languageOf('a/foto.png')).toThrow();
  });
});

describe('readProjectFile', () => {
  it('reads a file of a guided project', () => {
    expect(readProjectFile('tienda-api/01-node/hola.js')).toContain('Hola desde Node.js');
  });

  it('refuses what is not there, or outside projects/', () => {
    expect(() => readProjectFile('tienda-api/no-existe.ts')).toThrow('There is no project file');
    expect(() => readProjectFile('../package.json')).toThrow('There is no project file');
    expect(() => readProjectFile('../projects-old/x.ts')).toThrow('There is no project file');
  });

  it('refuses a symbolic link that leads out of projects/', () => {
    const work = mkdtempSync(join(tmpdir(), 'snippet-'));
    try {
      const root = join(work, 'projects');
      mkdirSync(join(root, 'tienda-api'), { recursive: true });
      writeFileSync(join(work, 'secreto.txt'), 'no');
      writeFileSync(join(root, 'tienda-api', 'bien.ts'), 'sí');
      symlinkSync(join(work, 'secreto.txt'), join(root, 'tienda-api', 'enlace.ts'));
      expect(readProjectFile('tienda-api/bien.ts', root)).toBe('sí');
      expect(() => readProjectFile('tienda-api/enlace.ts', root)).toThrow(
        'There is no project file',
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
