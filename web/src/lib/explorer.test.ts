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
  it('quita tildes, eñes y signos', () => {
    expect(toKebab('¿Qué es un protocolo?')).toBe('que-es-un-protocolo');
    expect(toKebab('El modelo TCP/IP')).toBe('el-modelo-tcp-ip');
    expect(toKebab('Diseño  de   APIs')).toBe('diseno-de-apis');
  });

  it('antepone la posición con dos cifras', () => {
    expect(toFileName('Qué es un protocolo', 2)).toBe('02-que-es-un-protocolo.md');
    expect(toFileName('Introducción', 0)).toBe('00-introduccion.md');
  });

  it('sin posición es un fichero raíz', () => {
    expect(toFileName('Glosario')).toBe('glosario.md');
  });

  it('lanza un error si no queda nada con lo que nombrar el fichero', () => {
    expect(() => toFileName('¿?')).toThrow(/nombre de fichero/);
  });
});

describe('phaseFolderName', () => {
  it('usa la palabra del idioma', () => {
    expect(phaseFolderName('es', 0)).toBe('fase-0');
    expect(phaseFolderName('en', 11)).toBe('phase-11');
  });
});

describe('findPhaseLinks', () => {
  it('devuelve los enlaces de la fase en orden', () => {
    expect(findPhaseLinks(sidebar, 'fase-0').map((l) => l.label)).toEqual([
      'Introducción',
      'Modelo cliente-servidor',
      'Qué es un protocolo',
    ]);
  });

  it('no confunde fase-1 con fase-10', () => {
    expect(findPhaseLinks(sidebar, 'fase-1')).toEqual([]);
  });
});

describe('locateCurrent', () => {
  it('encuentra la fase y la posición de la página actual (0 = introducción)', () => {
    const position = locateCurrent(sidebar, ['fase-0', 'fase-10']);
    expect(position?.phaseSlug).toBe('fase-0');
    expect(position?.index).toBe(2);
  });

  it('fuera de una fase no devuelve nada', () => {
    const outside: ExplorerEntry[] = sidebar.map((entry) =>
      entry.type === 'link'
        ? entry
        : { ...entry, entries: entry.entries.map((l) => ({ ...l, isCurrent: false })) },
    );
    expect(locateCurrent(outside, ['fase-0'])).toBeUndefined();
  });
});

describe('fileNameFor / pageFileName', () => {
  it('las lecciones llevan su posición y el resto no', () => {
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

  it('la portada es inicio.md en español y home.md en inglés: README no le dice nada a quien no programa', () => {
    expect(homeFileName('es')).toBe('inicio.md');
    expect(homeFileName('en')).toBe('home.md');
    expect(pageFileName('', 'Backend desde cero')).toBe('inicio.md');
    expect(pageFileName('index', 'Backend desde cero')).toBe('inicio.md');
    expect(pageFileName('en', 'Backend from Scratch')).toBe('home.md');
  });

  it('las páginas raíz del español no son la portada, aunque su id no tenga barra', () => {
    expect(pageFileName('glossary', 'Glosario')).toBe('glosario.md');
    expect(pageFileName('roadmap', 'Temario')).toBe('temario.md');
    expect(pageFileName('en/glossary', 'Glossary')).toBe('glossary.md');
  });

  it('las lecciones llevan su posición', () => {
    const position = locateCurrent(sidebar, ['fase-0']);
    expect(pageFileName('fase-0/que-es-un-protocolo', 'Qué es un protocolo', position)).toBe(
      '02-que-es-un-protocolo.md',
    );
  });
});

describe('fileNameFor con la etiqueta del sidebar', () => {
  it('usa la etiqueta que el sidebar da a ese href, aunque se le pase otro título', () => {
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

  it('devuelve la fase y la posición de la página actual, en la carpeta de su idioma', () => {
    const current = currentLesson(sidebar, [phase0, phase10], 'es');
    expect(current?.phase.number).toBe(0);
    expect(current?.position.index).toBe(2);
  });

  it('en inglés busca la carpeta phase-N', () => {
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

  it('la introducción, una lección con total y una lección sin total', () => {
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

  it('si el fichero ya se ve, no mueve nada', () => {
    expect(revealScrollTop(view, { top: 150, height: 28 })).toBe(100);
  });

  it('si está más abajo, lo centra', () => {
    expect(revealScrollTop(view, { top: 700, height: 28 })).toBe(700 - (300 - 28) / 2);
  });

  it('si solo se ve en parte, también lo centra', () => {
    expect(revealScrollTop(view, { top: 390, height: 28 })).toBe(390 - (300 - 28) / 2);
  });

  it('si está más arriba, lo centra sin pasar de 0', () => {
    expect(revealScrollTop(view, { top: 20, height: 28 })).toBe(0);
  });
});

describe('phaseSlugOf', () => {
  it('la carpeta de fase de un enlace; fase-1 y fase-10 no se confunden', () => {
    expect(phaseSlugOf('/fase-0/que-es-dns/', ['fase-0', 'fase-1', 'fase-10'])).toBe('fase-0');
    expect(phaseSlugOf('/fase-10/', ['fase-1', 'fase-10'])).toBe('fase-10');
    expect(phaseSlugOf('/en/phase-1/x/', ['phase-0', 'phase-1'])).toBe('phase-1');
  });

  it('fuera de una fase, ninguna', () => {
    expect(phaseSlugOf('/glossary/', ['fase-0'])).toBeUndefined();
    expect(phaseSlugOf('/', ['fase-0'])).toBeUndefined();
  });
});

describe('qualifiedFileName', () => {
  const slugs = ['fase-0', 'fase-10'];
  const modelo = { href: '/fase-0/modelo-cliente-servidor/', label: 'Modelo cliente-servidor' };

  it('dentro de la misma fase, el nombre solo', () => {
    expect(qualifiedFileName(sidebar, slugs, modelo, '/fase-0/que-es-un-protocolo/')).toBe(
      '01-modelo-cliente-servidor.md',
    );
  });

  it('al cambiar de fase, con la carpeta delante', () => {
    expect(qualifiedFileName(sidebar, slugs, modelo, '/fase-10/')).toBe(
      'fase-0/01-modelo-cliente-servidor.md',
    );
    expect(
      qualifiedFileName(sidebar, slugs, { href: '/fase-10/', label: 'Introducción' }, '/fase-0/'),
    ).toBe('fase-10/00-introduccion.md');
  });

  it('desde una página fuera de las fases (la portada), también con la carpeta', () => {
    expect(qualifiedFileName(sidebar, slugs, modelo, '/')).toBe(
      'fase-0/01-modelo-cliente-servidor.md',
    );
  });
});

describe('folderOpenByDefault', () => {
  it('dentro de una fase, solo su carpeta', () => {
    expect(folderOpenByDefault('fase-0', 'fase-0', 'fase-0')).toBe(true);
    expect(folderOpenByDefault('fase-1', 'fase-0', 'fase-0')).toBe(false);
    expect(folderOpenByDefault('fase-0', 'fase-1', 'fase-0')).toBe(false);
  });

  it('fuera de las fases (portada, glosario), la primera publicada', () => {
    expect(folderOpenByDefault('fase-0', undefined, 'fase-0')).toBe(true);
    expect(folderOpenByDefault('fase-1', undefined, 'fase-0')).toBe(false);
  });
});

describe('unexpectedSidebarEntries', () => {
  const phaseGroup = sidebar.filter((entry) => entry.type === 'group');

  it('un menú hecho solo de fases está bien', () => {
    expect(unexpectedSidebarEntries(phaseGroup, ['fase-0', 'fase-10'])).toEqual([]);
  });

  it('un enlace suelto o un grupo que no es una fase no se pintarían en el explorador', () => {
    const extra: ExplorerEntry[] = [
      link('Roadmap', '/roadmap/'),
      ...phaseGroup,
      { type: 'group', label: 'Extras', entries: [link('Uno', '/extras/uno/')] },
    ];
    expect(unexpectedSidebarEntries(extra, ['fase-0', 'fase-10'])).toEqual(['Roadmap', 'Extras']);
  });

  it('un grupo vacío (la fase aún sin traducir en este idioma) no molesta', () => {
    expect(
      unexpectedSidebarEntries([{ type: 'group', label: 'Phase 1', entries: [] }], ['phase-1']),
    ).toEqual([]);
  });
});
