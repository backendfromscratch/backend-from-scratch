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
    expect(languageOf('a/.npmrc')).toBe('ini');
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
  });
});
