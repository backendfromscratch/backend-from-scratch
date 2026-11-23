import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { LessonModule } from '../scenes/core/types';

// The rules of a scene lesson that can be checked on the files
// (docs/specs/2026-11-20-visual-lessons-design.md, §3 and §8).

const docs = fileURLToPath(new URL('./docs/', import.meta.url));

/**
 * The lesson modules, found by listing their folder and imported by file URL. Not with
 * import.meta.glob: Vitest keeps a test's transform in its module cache, and a glob expanded there
 * would not see a module added later.
 */
const lessonsDir = fileURLToPath(new URL('../scenes/lessons/', import.meta.url));
const files = readdirSync(lessonsDir).filter((name) => /^[^.]+\.ts$/.test(name));
const modules: Record<string, LessonModule<unknown>> = Object.fromEntries(
  await Promise.all(
    files.map(async (name) => {
      const loaded = (await import(pathToFileURL(lessonsDir + name).href)) as {
        default: LessonModule<unknown>;
      };
      return [name.replace(/\.ts$/, ''), loaded.default] as const;
    }),
  ),
);
const sources: Record<string, string> = Object.fromEntries(
  files.map((name) => [name.replace(/\.ts$/, ''), readFileSync(lessonsDir + name, 'utf8')]),
);

interface Lesson {
  path: string;
  locale: 'es' | 'en';
  key: string | undefined;
  scenes: boolean;
  text: string;
}

/** Every lesson and page of the course, with what the checks need from its header. */
function lessons(): Lesson[] {
  return readdirSync(docs, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.mdx'))
    .map((path) => {
      const text = readFileSync(docs + path, 'utf8');
      const header = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';
      return {
        path,
        locale: path.startsWith('en/') ? 'en' : 'es',
        key: /^translationKey:\s*(\S+)/m.exec(header)?.[1],
        scenes: /^scenes:\s*true\s*$/m.test(header),
        text,
      };
    });
}

/** The cues of a lesson, in order: each scene's id, and `end` for `<Scene end />`. */
function cues(text: string): string[] {
  return [...text.matchAll(/<Scene\b([^>]*)\/>/g)].map(([, attributes]) => {
    if (/^\s*end\s*$/.test(attributes!)) return 'end';
    return /^\s*id="([^"]+)"\s*$/.exec(attributes!)?.[1] ?? `invalid: <Scene${attributes}/>`;
  });
}

const all = lessons();
const withScenes = all.filter((lesson) => lesson.scenes);
const keys = [...new Set(withScenes.map((lesson) => lesson.key ?? lesson.path))];

describe('scene lessons', () => {
  it('include the pilot, «De la URL a la página», in both languages', () => {
    expect(withScenes.map((lesson) => lesson.path).sort()).toEqual(
      expect.arrayContaining([
        'en/phase-0/what-happens-when-you-type-a-url.mdx',
        'fase-0/que-pasa-cuando-escribes-una-url.mdx',
      ]),
    );
  });

  it.each(keys)('%s has a translationKey, a module and the same cues in both languages', (key) => {
    const pair = withScenes.filter((lesson) => (lesson.key ?? lesson.path) === key);
    expect(
      pair.map((lesson) => lesson.locale).sort(),
      'one lesson per language, both with scenes: true',
    ).toEqual(['en', 'es']);
    expect(pair[0]!.key, 'a scene lesson names its module with its translationKey').toBeDefined();
    const lesson = modules[key];
    expect(lesson, `src/scenes/lessons/${key}.ts`).toBeDefined();
    const [es, en] = [
      pair.find((l) => l.locale === 'es')!,
      pair.find((l) => l.locale === 'en')!,
    ].map((l) => cues(l.text));
    expect(en).toEqual(es);
    expect(
      es!.filter((cue) => cue !== 'end'),
      'the cues follow the module’s scenes, in order',
    ).toEqual(lesson!.scenes.map((scene) => scene.id));
    expect(
      es!.filter((cue) => cue === 'end').length,
      'at most one <Scene end />',
    ).toBeLessThanOrEqual(1);
    if (es!.includes('end'))
      expect(es!.at(-1), '<Scene end /> goes after the last cue').toBe('end');
  });

  it.each(withScenes.map((lesson) => lesson.path))(
    '%s puts each cue on its own line, before a heading',
    (path) => {
      const lines = all.find((lesson) => lesson.path === path)!.text.split('\n');
      lines.forEach((line, i) => {
        if (!line.includes('<Scene')) return;
        expect(line, `line ${i + 1}: a cue is alone on its line`).toMatch(/^<Scene\b[^>]*\/>$/);
        const next = lines.slice(i + 1).find((l) => l.trim() !== '');
        expect(next, `line ${i + 1}: the engine measures the heading after the cue`).toMatch(
          /^#{2,4} /,
        );
      });
    },
  );

  it.each(Object.keys(modules))(
    '%s has every chip and title in both languages, and no empty string',
    (file) => {
      for (const scene of modules[file]!.scenes) {
        for (const text of [scene.chip, scene.title]) {
          expect(text.es.trim(), `${scene.id}`).not.toBe('');
          expect(text.en.trim(), `${scene.id}`).not.toBe('');
        }
        // The bar's chip has a fixed width (scenes.css): 10 characters fit.
        for (const chip of [scene.chip.es, scene.chip.en]) {
          expect([...chip].length, `${scene.id}: «${chip}»`).toBeLessThanOrEqual(10);
        }
      }
      expect(sources[file]).not.toMatch(/\b(es|en):\s*(''|""|``)/);
    },
  );

  it.each(Object.keys(modules))('%s is used by a lesson', (key) => {
    expect(keys).toContain(key);
  });

  // ScenePanel.astro renders lessons/<key>.astro, whose script imports the choreography: a page
  // bundles only its own lesson's module (the SEO audit's JavaScript budget counts every chunk a
  // page's scripts can import).
  it.each(Object.keys(modules))('%s has its client entry, which imports only it', (key) => {
    const entry = readFileSync(`${lessonsDir}${key}.astro`, 'utf8');
    expect(entry).toContain(`import lesson from './${key}';`);
    expect(entry).toContain('boot(lesson);');
  });

  // A world's CSS reaches only the pages that draw it: each scene lesson's MDX imports its
  // lessons/<key>.css, which imports the CSS of exactly the worlds its module draws (Scene.astro
  // brings only the engine's). A world missing here would leave its actors unstyled on that page.
  it.each(Object.keys(modules))('%s has its CSS, with exactly the worlds it draws', (key) => {
    const css = readFileSync(`${lessonsDir}${key}.css`, 'utf8');
    const imported = [...css.matchAll(/^@import '\.\.\/worlds\/([\w-]+)\/([\w-]+)\.css';$/gm)].map(
      ([, folder, file]) => (folder === file ? folder! : `${folder}/${file}`),
    );
    expect(imported.sort()).toEqual(modules[key]!.worlds.map((world) => world.id).sort());
    expect(
      css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^@import .*$/gm, '')
        .trim(),
    ).toBe('');
  });

  it.each(withScenes.map((lesson) => lesson.path))('%s imports its lesson’s CSS', (path) => {
    const lesson = withScenes.find((l) => l.path === path)!;
    expect(lesson.text).toContain(`\nimport '~/scenes/lessons/${lesson.key}.css';\n`);
  });

  it('no lesson without scenes: true has cues', () => {
    const stray = all
      .filter((lesson) => !lesson.scenes && cues(lesson.text).length > 0)
      .map((lesson) => lesson.path);
    expect(stray).toEqual([]);
  });
});

describe('reading the cues', () => {
  it('finds the ids and the end, in order', () => {
    expect(cues('<Scene id="dns" />\n\n## DNS\n\n<Scene id="tcp" />\n<Scene end />')).toEqual([
      'dns',
      'tcp',
      'end',
    ]);
  });

  it('flags a cue it cannot read', () => {
    expect(cues("<Scene id='dns' />")).toEqual(["invalid: <Scene id='dns' />"]);
  });
});
