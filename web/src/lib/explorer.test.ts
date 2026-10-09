import { describe, expect, it } from 'vitest';
import {
  type ExplorerEntry,
  currentLesson,
  fileNameFor,
  homeFileName,
  linkLabel,
  statusStep,
  findPhaseLinks,
  locateCurrent,
  pageFileName,
  phaseFolderName,
  revealScrollTop,
  folderOpenByDefault,
  phaseSlugOf,
  qualifiedFileName,
  toFileName,
  toKebab,
  unexpectedSidebarEntries,
} from './explorer';

const link = (label: string, href: string, isCurrent = false) =>
  ({ type: 'link', label, href, isCurrent }) as const;

const sidebar: ExplorerEntry[] = [
  link('Roadmap', '/roadmap/'),
  link('Glosario', '/glossary/'),
  {
    type: 'group',
    label: 'Fase 0 · Cómo funciona internet',
    entries: [
      link('Introducción', '/fase-0/'),
      link('Modelo cliente-servidor', '/fase-0/modelo-cliente-servidor/'),
      link('Qué es un protocolo', '/fase-0/que-es-un-protocolo/', true),
    ],
  },
  {
    type: 'group',
    label: 'Fase 10 · Calidad',
    entries: [link('Introducción', '/fase-10/')],
  },
];

describe('toKebab / toFileName', () => {
  it('removes accents, ñ and punctuation', () => {
    expect(toKebab('¿Qué es un protocolo?')).toBe('que-es-un-protocolo');
    expect(toKebab('El modelo TCP/IP')).toBe('el-modelo-tcp-ip');
    expect(toKebab('Diseño  de   APIs')).toBe('diseno-de-apis');
  });

  it('prefixes the position with two digits', () => {
    expect(toFileName('Qué es un protocolo', 2)).toBe('02-que-es-un-protocolo.md');
    expect(toFileName('Introducción', 0)).toBe('00-introduccion.md');
  });

  it('without a position it is a root file', () => {
    expect(toFileName('Glosario')).toBe('glosario.md');
  });

  it('throws if nothing is left to name the file with', () => {
    expect(() => toFileName('¿?')).toThrow(/file name/);
  });
});

describe('phaseFolderName', () => {
  it('uses the word of the language', () => {
    expect(phaseFolderName('es', 0)).toBe('fase-0');
    expect(phaseFolderName('en', 11)).toBe('phase-11');
  });
});

describe('findPhaseLinks', () => {
  it('returns the links of the phase in order', () => {
    expect(findPhaseLinks(sidebar, 'fase-0').map((l) => l.label)).toEqual([
      'Introducción',
      'Modelo cliente-servidor',
      'Qué es un protocolo',
    ]);
  });

  it('does not confuse fase-1 with fase-10', () => {
    expect(findPhaseLinks(sidebar, 'fase-1')).toEqual([]);
  });
});

describe('locateCurrent', () => {
  it('finds the phase and position of the current page (0 = introduction)', () => {
    const position = locateCurrent(sidebar, ['fase-0', 'fase-10']);
    expect(position?.phaseSlug).toBe('fase-0');
    expect(position?.index).toBe(2);
  });

  it('outside a phase it returns nothing', () => {
    const outside: ExplorerEntry[] = sidebar.map((entry) =>
      entry.type === 'link'
        ? entry
        : { ...entry, entries: entry.entries.map((l) => ({ ...l, isCurrent: false })) },
    );
    expect(locateCurrent(outside, ['fase-0'])).toBeUndefined();
  });
});

describe('fileNameFor / pageFileName', () => {
  it('lessons carry their position and the rest do not', () => {
    expect(
      fileNameFor(sidebar, ['fase-0'], {
        href: '/fase-0/modelo-cliente-servidor/',
        label: 'Modelo cliente-servidor',
      }),
    ).toBe('01-modelo-cliente-servidor.md');
    expect(fileNameFor(sidebar, ['fase-0'], { href: '/roadmap/', label: 'Roadmap' })).toBe(
      'roadmap.md',
    );
  });

  it('the home page is inicio.md in Spanish and home.md in English: README means nothing to someone who does not program', () => {
    expect(homeFileName('es')).toBe('inicio.md');
    expect(homeFileName('en')).toBe('home.md');
    expect(pageFileName('', 'Backend desde cero')).toBe('inicio.md');
    expect(pageFileName('index', 'Backend desde cero')).toBe('inicio.md');
    expect(pageFileName('en', 'Backend from Scratch')).toBe('home.md');
  });

  it('Spanish root pages are not the home page, even if their id has no slash', () => {
    expect(pageFileName('glossary', 'Glosario')).toBe('glosario.md');
    expect(pageFileName('roadmap', 'Temario')).toBe('temario.md');
    expect(pageFileName('en/glossary', 'Glossary')).toBe('glossary.md');
  });

  it('lessons carry their position', () => {
    const position = locateCurrent(sidebar, ['fase-0']);
    expect(pageFileName('fase-0/que-es-un-protocolo', 'Qué es un protocolo', position)).toBe(
      '02-que-es-un-protocolo.md',
    );
  });
});

describe('fileNameFor with the sidebar label', () => {
  it('uses the label the sidebar gives that href, even if another title is passed', () => {
    const english: ExplorerEntry[] = [
      {
        type: 'group',
        label: 'Phase 0',
        entries: [
          link('Introduction', '/en/phase-0/'),
          link('The client-server model', '/en/phase-0/client-server-model/'),
        ],
      },
    ];
    expect(
      fileNameFor(english, ['phase-0'], {
        href: '/en/phase-0/client-server-model/',
        label: 'Modelo cliente-servidor',
      }),
    ).toBe('01-the-client-server-model.md');
    expect(linkLabel(english, '/en/phase-0/client-server-model/')).toBe('The client-server model');
    expect(linkLabel(english, '/en/nope/')).toBeUndefined();
  });
});

describe('currentLesson / statusStep', () => {
  const phase0 = {
    number: 0,
    status: 'available',
    lessonCount: 8,
    title: { es: '', en: '' },
    summary: { es: '', en: '' },
  } as const;
  const phase10 = { ...phase0, number: 10, lessonCount: undefined };

  it('returns the phase and position of the current page, in the folder of its language', () => {
    const current = currentLesson(sidebar, [phase0, phase10], 'es');
    expect(current?.phase.number).toBe(0);
    expect(current?.position.index).toBe(2);
  });

  it('in English it looks for the phase-N folder', () => {
    const english: ExplorerEntry[] = [
      {
        type: 'group',
        label: 'Phase 0',
        entries: [
          link('Introduction', '/en/phase-0/'),
          link('What is DNS?', '/en/phase-0/what-is-dns/', true),
        ],
      },
    ];
    expect(currentLesson(english, [phase0], 'en')?.position.index).toBe(1);
    expect(currentLesson(english, [phase0], 'es')).toBeUndefined();
  });

  it('the introduction, a lesson with a total and a lesson without a total', () => {
    const at = (index: number, phase: typeof phase0 | typeof phase10) => ({
      phase,
      position: { phaseSlug: phaseFolderName('es', phase.number), index, links: [] },
    });
    expect(statusStep(at(0, phase0))).toEqual({ key: 'status.intro' });
    expect(statusStep(at(2, phase0))).toEqual({ key: 'status.lesson', n: 2, total: 8 });
    expect(statusStep(at(3, phase10))).toEqual({ key: 'status.lessonNoTotal', n: 3 });
  });
});

describe('revealScrollTop', () => {
  const view = { scrollTop: 100, height: 300 };

  it('if the file is already visible, it moves nothing', () => {
    expect(revealScrollTop(view, { top: 150, height: 28 })).toBe(100);
  });

  it('if it is further down, it centers it', () => {
    expect(revealScrollTop(view, { top: 700, height: 28 })).toBe(700 - (300 - 28) / 2);
  });

  it('if it is only partly visible, it also centers it', () => {
    expect(revealScrollTop(view, { top: 390, height: 28 })).toBe(390 - (300 - 28) / 2);
  });

  it('if it is further up, it centers it without going below 0', () => {
    expect(revealScrollTop(view, { top: 20, height: 28 })).toBe(0);
  });
});

describe('phaseSlugOf', () => {
  it('the phase folder of a link; fase-1 and fase-10 are not confused', () => {
    expect(phaseSlugOf('/fase-0/que-es-dns/', ['fase-0', 'fase-1', 'fase-10'])).toBe('fase-0');
    expect(phaseSlugOf('/fase-10/', ['fase-1', 'fase-10'])).toBe('fase-10');
    expect(phaseSlugOf('/en/phase-1/x/', ['phase-0', 'phase-1'])).toBe('phase-1');
  });

  it('outside a phase, none', () => {
    expect(phaseSlugOf('/glossary/', ['fase-0'])).toBeUndefined();
    expect(phaseSlugOf('/', ['fase-0'])).toBeUndefined();
  });
});

describe('qualifiedFileName', () => {
  const slugs = ['fase-0', 'fase-10'];
  const modelo = { href: '/fase-0/modelo-cliente-servidor/', label: 'Modelo cliente-servidor' };

  it('within the same phase, the name alone', () => {
    expect(qualifiedFileName(sidebar, slugs, modelo, '/fase-0/que-es-un-protocolo/')).toBe(
      '01-modelo-cliente-servidor.md',
    );
  });

  it('when changing phase, with the folder in front', () => {
    expect(qualifiedFileName(sidebar, slugs, modelo, '/fase-10/')).toBe(
      'fase-0/01-modelo-cliente-servidor.md',
    );
    expect(
      qualifiedFileName(sidebar, slugs, { href: '/fase-10/', label: 'Introducción' }, '/fase-0/'),
    ).toBe('fase-10/00-introduccion.md');
  });

  it('from a page outside the phases (the home page), also with the folder', () => {
    expect(qualifiedFileName(sidebar, slugs, modelo, '/')).toBe(
      'fase-0/01-modelo-cliente-servidor.md',
    );
  });
});

describe('folderOpenByDefault', () => {
  it('inside a phase, only its folder', () => {
    expect(folderOpenByDefault('fase-0', 'fase-0', 'fase-0')).toBe(true);
    expect(folderOpenByDefault('fase-1', 'fase-0', 'fase-0')).toBe(false);
    expect(folderOpenByDefault('fase-0', 'fase-1', 'fase-0')).toBe(false);
  });

  it('outside the phases (home, glossary), the first published one', () => {
    expect(folderOpenByDefault('fase-0', undefined, 'fase-0')).toBe(true);
    expect(folderOpenByDefault('fase-1', undefined, 'fase-0')).toBe(false);
  });
});

describe('unexpectedSidebarEntries', () => {
  const phaseGroup = sidebar.filter((entry) => entry.type === 'group');

  it('a menu made only of phases is fine', () => {
    expect(unexpectedSidebarEntries(phaseGroup, ['fase-0', 'fase-10'])).toEqual([]);
  });

  it('a loose link or a group that is not a phase would not be drawn in the explorer', () => {
    const extra: ExplorerEntry[] = [
      link('Roadmap', '/roadmap/'),
      ...phaseGroup,
      { type: 'group', label: 'Extras', entries: [link('Uno', '/extras/uno/')] },
    ];
    expect(unexpectedSidebarEntries(extra, ['fase-0', 'fase-10'])).toEqual(['Roadmap', 'Extras']);
  });

  it('an empty group (the phase not yet translated into this language) is not a problem', () => {
    expect(
      unexpectedSidebarEntries([{ type: 'group', label: 'Phase 1', entries: [] }], ['phase-1']),
    ).toEqual([]);
  });
});
