# Plan de implementación: maqueta de editor (diseño C)

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que la web aproveche todo el ancho y se parezca más a un editor. Lo que entra:
- barra de actividad;
- explorador con el esquema de la página;
- pestañas y migas a todo el ancho y fijas;
- números de línea desde el título, pegados al borde;
- prosa a 75 caracteres y piezas anchas a todo el editor;
- línea resaltada al pasar el ratón;
- minimapa en ordenadores;
- barra de estado discreta.

**Arquitectura:** se sustituyen cuatro componentes más de Starlight y se cambian otros cuatro que ya estaban sustituidos.
- **Nuevos `Header`, `TwoColumnContent` y `PageSidebar`.**
  - La cabecera queda sin tema ni idioma.
  - La zona del editor tiene las pestañas arriba y el minimapa a la derecha, sin columna de índice.
  - El índice móvil solo se ve por debajo de 50rem.
- **`Sidebar`, `PageTitle` y `Footer` (ya sustituidos) cambian:**
  - `Sidebar` lleva la barra de actividad, el árbol y el esquema;
  - `PageTitle` se queda solo con el título y la entrada de la lección;
  - `Footer` pasa a la barra de estado discreta.
- **Lógica sin DOM con tests en `src/lib/`:**
  - `activity.ts`: tema, almacenamiento seguro y enlaces;
  - `minimap.ts`: escala, barras, rectángulo y salto;
  - `explorer.ts`: revelar el fichero abierto.
- **El resto es CSS en `theme.css`** y en el estilo de cada componente.

**Stack:** Astro 7.3.5, Starlight 0.42.5, TypeScript, Vitest 5 y pnpm. No se añade ninguna dependencia.

**Spec:** `docs/specs/2026-10-03-maqueta-editor-design.md`, que amplía `docs/specs/2026-10-02-tema-ide-design.md`. Bocetos: https://claude.ai/artifact/1J4ae5sUqPwN4QZoQ6k7GK (maqueta «C · Esquema en el explorador»).

## Restricciones globales

**Forma de trabajar**
- **Sin commits ni push:** el autor no quiere commits, y el proyecto no es un repositorio git. Cada tarea termina con su verificación.
- **Comandos,** desde la raíz del repo:

  | Para qué | Comando |
  |---|---|
  | Un fichero de tests | `pnpm --filter web exec vitest run <ruta desde web/>` |
  | Todos los tests | `pnpm test` |
  | Tipos | `pnpm check` |
  | Formato | `pnpm format:check` |
  | Build (con la auditoría SEO y el validador de enlaces) | `pnpm build` |

- **Ficheros temporales y logs:** en el scratchpad de la sesión, nunca en `/tmp`. En los comandos de este plan, `$S` es esa carpeta. Sin datos personales en las salidas.
- **Navegador:**
  - se prueba con la vista previa del build: `pnpm --filter web exec astro preview --port 4323`, en segundo plano si no está ya en marcha;
  - las capturas de Playwright se guardan en `.playwright-mcp/` o en la raíz del proyecto, y se borran al terminar, después de listar la carpeta.
- **Código:** comentarios, mensajes de error y textos en español, como el resto del código.

**Valores fijos (de la spec)**

| Qué | Valor |
|---|---|
| Panel lateral (`--sl-sidebar-width`) | `19.25rem` = barra de actividad `3.25rem` (`--ide-activity-width`) + explorador `16rem` |
| Panel con el explorador oculto | `--ide-activity-width` |
| Minimapa | desde `82rem`, `6rem` de ancho (`--ide-minimap-width`) |
| Números de línea y barra de actividad | desde `50rem` |
| Hueco de los números (`--ide-gutter-width`) | `5rem`: número de `3.5rem` + `1.5rem` de separación |
| Prosa (`--ide-measure`) | `75ch` (párrafos, listas, `dl`, citas) |
| Cajas (`--ide-box-width`) | `51.25rem` (entrada de la lección, analogía, autoevaluación…) |
| Piezas anchas, a todo el editor | `table`, `figure`, `.expressive-code`, `.try-it`, `astro-island`, `.phase-list` |
| Pestañas (`--ide-tabbar-height`) y migas (`--ide-breadcrumbs-height`) | `2.5rem` y `1.875rem` |
| Token nuevo `--ide-line` | oscuro `#211f2a`, claro `#f2f0f7` |
| Claves de `localStorage` | `starlight-theme` (la de Starlight) e `ide-explorer` (`'closed'` o vacío) |
| Reparto del panel | explorador 58 %, esquema 42 % |

## Review Focus

1. **Un salto a un ancla** (clic en el esquema o una URL con `#`) con las pestañas fijas: el título de la sección tiene que quedar visible debajo de las pestañas, no tapado. Prueba: Tarea 5, paso 6.
2. **`localStorage` no disponible** (navegación privada, datos bloqueados, cuota llena): el botón de tema y el de explorador funcionan igual, solo que sin recordar nada. Prueba: Tarea 2, tests de `safeStorage`.
3. **Una página más corta que la ventana** (portada, glosario): el minimapa no dibuja barras gigantes y el rectángulo no se sale. Prueba: Tarea 3 (tope de escala, página corta) y Tarea 7, paso 6.
4. **Páginas sin índice** (portada, glosario): no hay sección ESQUEMA, y el árbol ocupa todo el alto. Prueba: Tarea 6, pasos 1 y 9.
5. **El explorador oculto en escritorio y la web abierta luego en el móvil:** el menú ☰ tiene que mostrar el árbol igual. Prueba: Tarea 6, paso 10.

---

### Tarea 1: Token `--ide-line` y barra de estado discreta

**Ficheros:**
- Modificar: `web/src/styles/tokens.test.ts`
- Modificar: `web/src/styles/theme.css` (los tres bloques de tokens)
- Modificar: `web/src/components/overrides/Footer.astro` (estilo de `.ide-statusbar`)

**Interfaces:**
- Produce: el token `--ide-line` (fondo de la línea resaltada) en oscuro, claro e impresión.

- [ ] **Paso 1: el test pide el fondo nuevo**

En `web/src/styles/tokens.test.ts`, cambia la lista de fondos y el nombre del último test, que ya no es de la barra de estado:

```ts
const BACKGROUNDS = ['bg', 'chrome', 'deep', 'selection', 'line'];
```

```ts
  it('on-accent sobre accent llega a 4,5:1', () => {
```

- [ ] **Paso 2: ver que falla**

Run: `pnpm --filter web exec vitest run src/styles/tokens.test.ts`
Expected: FAIL en «define todos los tokens de texto y de fondo» (`line` es `undefined`) y en los contrastes «… sobre line», en los dos temas.

- [ ] **Paso 3: añadir el token**

En `web/src/styles/theme.css`:
- en el bloque `:root` de los tokens, después de `--ide-selection: #2a2836;`, añade `--ide-line: #211f2a;`;
- en `:root[data-theme='light']`, después de `--ide-selection: #e4e0f0;`, añade `--ide-line: #f2f0f7;`;
- en el bloque de `@media print`, después de su `--ide-selection: #e4e0f0;`, añade `--ide-line: #ffffff;`.

- [ ] **Paso 4: ver que pasa**

Run: `pnpm --filter web exec vitest run src/styles/tokens.test.ts`
Expected: PASS, todos.

- [ ] **Paso 5: la barra de estado, discreta**

Comprobación previa: `grep -n "background: var(--ide-accent)" web/src/components/overrides/Footer.astro`
Expected: una coincidencia (la barra es naranja).

En el `<style>` de `Footer.astro`, dentro de `.ide-statusbar`, sustituye:

```css
    background: var(--ide-accent);
    color: var(--ide-on-accent);
```

por:

```css
    border-top: 1px solid var(--ide-border);
    background: var(--ide-chrome);
    color: var(--ide-muted);
```

Vuelve a lanzar el `grep`. Expected: ninguna coincidencia. `--ide-muted` sobre `--ide-chrome` ya está cubierto por el test de contraste.

- [ ] **Paso 6: verificación de la tarea**

Run: `pnpm test > $S/t1.log 2>&1; tail -4 $S/t1.log; pnpm check > $S/c1.log 2>&1; grep -E "Result|error" $S/c1.log | tail -2`
Expected: todos los tests en verde y 0 errores. Sin commit.

---

### Tarea 2: Lógica de la barra de actividad y del explorador

**Ficheros:**
- Crear: `web/src/lib/activity.ts`
- Crear: `web/src/lib/activity.test.ts`
- Modificar: `web/src/lib/explorer.ts` (añadir `revealScrollTop`)
- Modificar: `web/src/lib/explorer.test.ts`

**Interfaces:**
- Consume:
  - `localizedHref(locale: Locale, slug?: string): string` de `./links`;
  - `locales` y `Locale` de `./locales`.
- Produce:
  - `type Theme = 'auto' | 'dark' | 'light'`;
  - `THEME_KEY = 'starlight-theme'` y `EXPLORER_KEY = 'ide-explorer'`;
  - `parseTheme(value: unknown): Theme` y `nextTheme(theme: Theme): Theme`;
  - `storedTheme(theme: Theme): string`;
  - `interface SafeStorage { get(key: string): string | null; set(key: string, value: string): void }`;
  - `safeStorage(getStorage: () => Pick<Storage, 'getItem' | 'setItem'>): SafeStorage`;
  - `otherLocale(locale: Locale): Locale`;
  - `activityLinks(locale: Locale): { roadmap: string; glossary: string }`;
  - en `explorer.ts`: `revealScrollTop(view: { scrollTop: number; height: number }, item: { top: number; height: number }): number`.

- [ ] **Paso 1: los tests de `activity.ts`**

Crea `web/src/lib/activity.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  activityLinks,
  nextTheme,
  otherLocale,
  parseTheme,
  safeStorage,
  storedTheme,
} from './activity';

describe('tema', () => {
  it('pasa por automático, oscuro y claro, y vuelve a empezar', () => {
    expect(nextTheme('auto')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('auto');
  });

  it('lo que no reconoce es automático, como en Starlight', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('')).toBe('auto');
    expect(parseTheme(null)).toBe('auto');
    expect(parseTheme('sepia')).toBe('auto');
  });

  it('«automático» se guarda vacío, como lo guarda Starlight', () => {
    expect(storedTheme('auto')).toBe('');
    expect(storedTheme('dark')).toBe('dark');
    expect(storedTheme('light')).toBe('light');
  });
});

describe('safeStorage', () => {
  it('guarda y lee cuando hay almacenamiento', () => {
    const data = new Map<string, string>();
    const storage = safeStorage(() => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
    }));
    storage.set('ide-explorer', 'closed');
    expect(storage.get('ide-explorer')).toBe('closed');
  });

  it('sin localStorage (navegación privada) no lanza: lee null y no guarda', () => {
    const storage = safeStorage(() => {
      throw new DOMException('Acceso denegado', 'SecurityError');
    });
    expect(storage.get('starlight-theme')).toBeNull();
    expect(() => storage.set('starlight-theme', 'dark')).not.toThrow();
  });

  it('si guardar falla (cuota llena), no lanza', () => {
    const storage = safeStorage(() => ({
      getItem: () => null,
      setItem: () => {
        throw new DOMException('Sin espacio', 'QuotaExceededError');
      },
    }));
    expect(() => storage.set('ide-explorer', 'closed')).not.toThrow();
  });
});

describe('enlaces de la barra', () => {
  it('el otro idioma', () => {
    expect(otherLocale('es')).toBe('en');
    expect(otherLocale('en')).toBe('es');
  });

  it('temario y glosario, en el idioma de la página', () => {
    expect(activityLinks('es')).toEqual({ roadmap: '/roadmap/', glossary: '/glossary/' });
    expect(activityLinks('en')).toEqual({ roadmap: '/en/roadmap/', glossary: '/en/glossary/' });
  });
});
```

- [ ] **Paso 2: ver que falla**

Run: `pnpm --filter web exec vitest run src/lib/activity.test.ts`
Expected: FAIL, «Failed to resolve import "./activity"».

- [ ] **Paso 3: implementar `activity.ts`**

Crea `web/src/lib/activity.ts`:

```ts
/**
 * La lógica de la barra de actividad (src/components/ActivityBar.astro), sin DOM: el ciclo del
 * tema, un almacenamiento que no falla y los enlaces fijos de cada idioma.
 */
import { localizedHref } from './links';
import { locales, type Locale } from './locales';

export type Theme = 'auto' | 'dark' | 'light';

/** La misma clave que usa el selector de tema de Starlight: así los dos están de acuerdo. */
export const THEME_KEY = 'starlight-theme';
/** 'closed' si el lector ha ocultado el explorador; vacío si no. */
export const EXPLORER_KEY = 'ide-explorer';

const THEME_ORDER: readonly Theme[] = ['auto', 'dark', 'light'];

export function parseTheme(value: unknown): Theme {
  return value === 'dark' || value === 'light' ? value : 'auto';
}

/** Automático → oscuro → claro → automático. */
export function nextTheme(theme: Theme): Theme {
  return THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]!;
}

/** Lo que se guarda: Starlight guarda una cadena vacía para «automático». */
export function storedTheme(theme: Theme): string {
  return theme === 'auto' ? '' : theme;
}

export interface SafeStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/**
 * localStorage puede no existir o lanzar (navegación privada, datos bloqueados, cuota llena).
 * Entonces la barra sigue funcionando, solo que sin recordar nada.
 */
export function safeStorage(getStorage: () => Pick<Storage, 'getItem' | 'setItem'>): SafeStorage {
  return {
    get(key) {
      try {
        return getStorage().getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        getStorage().setItem(key, value);
      } catch {
        // Sin almacenamiento, el cambio vale solo para esta página.
      }
    },
  };
}

export function otherLocale(locale: Locale): Locale {
  return locales.find((candidate) => candidate !== locale) ?? locale;
}

/** Los enlaces fijos de la barra: el temario y el glosario, en el idioma de la página. */
export function activityLinks(locale: Locale): { roadmap: string; glossary: string } {
  return {
    roadmap: localizedHref(locale, 'roadmap'),
    glossary: localizedHref(locale, 'glossary'),
  };
}
```

- [ ] **Paso 4: ver que pasa**

Run: `pnpm --filter web exec vitest run src/lib/activity.test.ts`
Expected: PASS, 8 tests.

- [ ] **Paso 5: el test de `revealScrollTop`**

En `web/src/lib/explorer.test.ts`, añade `revealScrollTop` a la importación de `./explorer` y este bloque al final:

```ts
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
```

- [ ] **Paso 6: ver que falla**

Run: `pnpm --filter web exec vitest run src/lib/explorer.test.ts`
Expected: FAIL en `revealScrollTop`, «revealScrollTop is not a function».

- [ ] **Paso 7: implementar `revealScrollTop`**

Al final de `web/src/lib/explorer.ts`:

```ts
/**
 * Cuánto desplazar el árbol del explorador para que se vea el fichero abierto, como hace un
 * editor: nada si ya se ve entero; si no, lo centra.
 */
export function revealScrollTop(
  view: { scrollTop: number; height: number },
  item: { top: number; height: number },
): number {
  const visible =
    item.top >= view.scrollTop && item.top + item.height <= view.scrollTop + view.height;
  if (visible) return view.scrollTop;
  return Math.max(0, item.top - (view.height - item.height) / 2);
}
```

- [ ] **Paso 8: verificación de la tarea**

Run: `pnpm --filter web exec vitest run src/lib/explorer.test.ts src/lib/activity.test.ts && pnpm test > $S/t2.log 2>&1; tail -4 $S/t2.log`
Expected: todo en verde. Sin commit.

---

### Tarea 3: Lógica del minimapa

**Ficheros:**
- Crear: `web/src/lib/minimap.ts`
- Crear: `web/src/lib/minimap.test.ts`

**Interfaces:**
- Produce:
  - `type BlockKind = 'heading' | 'code' | 'text'`;
  - `interface Block { top: number; height: number; width: number; kind: BlockKind }`, con `top` y `height` en px del documento, y `width` como fracción del ancho del contenido;
  - `interface Bar { top: number; height: number; width: number; kind: BlockKind }`, en px del minimapa;
  - `MAX_SCALE = 0.2` y `MIN_BAR_HEIGHT = 2`;
  - `minimapScale(docHeight: number, mapHeight: number): number`;
  - `layoutBars(blocks: readonly Block[], scale: number): Bar[]`;
  - `viewportRect(scrollY: number, viewHeight: number, scale: number): { top: number; height: number }`;
  - `scrollTargetFor(mapY: number, scale: number, viewHeight: number, docHeight: number): number`;
  - `blockKind(tagName: string, classList: readonly string[]): BlockKind`.

- [ ] **Paso 1: los tests**

Crea `web/src/lib/minimap.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE,
  MIN_BAR_HEIGHT,
  blockKind,
  layoutBars,
  minimapScale,
  scrollTargetFor,
  viewportRect,
} from './minimap';

describe('minimapScale', () => {
  it('una página larga cabe entera en el alto del minimapa', () => {
    expect(minimapScale(10_000, 800)).toBeCloseTo(0.08);
  });

  it('una página corta no se agranda: como mucho, MAX_SCALE', () => {
    expect(minimapScale(1_000, 800)).toBe(MAX_SCALE);
  });

  it('sin alto (minimapa oculto o página vacía), la escala es 0', () => {
    expect(minimapScale(0, 800)).toBe(0);
    expect(minimapScale(5_000, 0)).toBe(0);
  });
});

describe('layoutBars', () => {
  it('escala la posición y el alto de cada bloque', () => {
    const [bar] = layoutBars([{ top: 1000, height: 500, width: 0.5, kind: 'text' }], 0.1);
    expect(bar?.top).toBeCloseTo(100);
    expect(bar?.height).toBeCloseTo(50);
    expect(bar).toMatchObject({ width: 0.5, kind: 'text' });
  });

  it('un bloque bajito se sigue viendo: mide como mínimo MIN_BAR_HEIGHT', () => {
    expect(layoutBars([{ top: 0, height: 5, width: 1, kind: 'heading' }], 0.1)[0]?.height).toBe(
      MIN_BAR_HEIGHT,
    );
  });

  it('el ancho queda entre el 10 % y el 100 %', () => {
    const [narrow, wide] = layoutBars(
      [
        { top: 0, height: 100, width: 0.01, kind: 'text' },
        { top: 0, height: 100, width: 1.4, kind: 'code' },
      ],
      0.1,
    );
    expect(narrow?.width).toBe(0.1);
    expect(wide?.width).toBe(1);
  });

  it('los bloques sin alto (ocultos) no se dibujan', () => {
    expect(layoutBars([{ top: 0, height: 0, width: 1, kind: 'text' }], 0.1)).toEqual([]);
  });
});

describe('viewportRect', () => {
  it('el rectángulo es la ventana a escala', () => {
    const rect = viewportRect(2000, 900, 0.1);
    expect(rect.top).toBeCloseTo(200);
    expect(rect.height).toBeCloseTo(90);
  });

  it('en una página corta, el rectángulo no pasa del alto que ocupa la página', () => {
    const scale = minimapScale(600, 800);
    expect(viewportRect(0, 600, scale).height).toBeCloseTo(600 * MAX_SCALE);
  });
});

describe('scrollTargetFor', () => {
  it('centra la ventana en el punto pulsado', () => {
    expect(scrollTargetFor(300, 0.1, 900, 10_000)).toBeCloseTo(3000 - 450);
  });

  it('no sube de 0 ni baja del final', () => {
    expect(scrollTargetFor(10, 0.1, 900, 10_000)).toBe(0);
    expect(scrollTargetFor(990, 0.1, 900, 10_000)).toBe(10_000 - 900);
  });

  it('una página más corta que la ventana no se desplaza', () => {
    expect(scrollTargetFor(50, MAX_SCALE, 900, 600)).toBe(0);
  });

  it('sin escala, no se mueve', () => {
    expect(scrollTargetFor(100, 0, 900, 10_000)).toBe(0);
  });
});

describe('blockKind', () => {
  it('títulos', () => {
    expect(blockKind('H1', [])).toBe('heading');
    expect(blockKind('DIV', ['sl-heading-wrapper', 'level-h2'])).toBe('heading');
  });

  it('código y terminales', () => {
    expect(blockKind('DIV', ['expressive-code'])).toBe('code');
    expect(blockKind('SECTION', ['try-it'])).toBe('code');
    expect(blockKind('PRE', [])).toBe('code');
  });

  it('lo demás es texto', () => {
    expect(blockKind('P', [])).toBe('text');
    expect(blockKind('DIV', ['lesson-intro'])).toBe('text');
  });
});
```

- [ ] **Paso 2: ver que falla**

Run: `pnpm --filter web exec vitest run src/lib/minimap.test.ts`
Expected: FAIL, «Failed to resolve import "./minimap"».

- [ ] **Paso 3: implementar**

Crea `web/src/lib/minimap.ts`:

```ts
/**
 * El minimapa (src/components/Minimap.astro), sin DOM: un plano de la página donde cada bloque del
 * contenido es una barra. Todo el documento cabe en el alto del minimapa; un rectángulo marca lo
 * que se ve, y al pulsar en el minimapa la página salta ahí.
 */
export type BlockKind = 'heading' | 'code' | 'text';

/** Un bloque del contenido: posición y alto en px del documento; ancho, fracción del contenido. */
export interface Block {
  top: number;
  height: number;
  width: number;
  kind: BlockKind;
}

/** Una barra del minimapa, en px del minimapa (el ancho sigue siendo una fracción). */
export type Bar = Block;

/** En una página corta, el minimapa no dibuja bloques gigantes. */
export const MAX_SCALE = 0.2;
/** Un bloque bajito (una línea) sigue viéndose. */
export const MIN_BAR_HEIGHT = 2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function minimapScale(docHeight: number, mapHeight: number): number {
  if (docHeight <= 0 || mapHeight <= 0) return 0;
  return Math.min(MAX_SCALE, mapHeight / docHeight);
}

export function layoutBars(blocks: readonly Block[], scale: number): Bar[] {
  return blocks
    .filter((block) => block.height > 0)
    .map((block) => ({
      top: block.top * scale,
      height: Math.max(MIN_BAR_HEIGHT, block.height * scale),
      width: clamp(block.width, 0.1, 1),
      kind: block.kind,
    }));
}

export function viewportRect(
  scrollY: number,
  viewHeight: number,
  scale: number,
): { top: number; height: number } {
  return { top: scrollY * scale, height: viewHeight * scale };
}

/** Adónde desplazar la página al pulsar en `mapY` (px desde arriba del minimapa): ese punto, centrado. */
export function scrollTargetFor(
  mapY: number,
  scale: number,
  viewHeight: number,
  docHeight: number,
): number {
  if (scale <= 0) return 0;
  return clamp(mapY / scale - viewHeight / 2, 0, Math.max(0, docHeight - viewHeight));
}

export function blockKind(tagName: string, classList: readonly string[]): BlockKind {
  const tag = tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag) || classList.includes('sl-heading-wrapper')) return 'heading';
  if (tag === 'pre' || classList.some((name) => name === 'expressive-code' || name === 'try-it')) {
    return 'code';
  }
  return 'text';
}
```

- [ ] **Paso 4: ver que pasa**

Run: `pnpm --filter web exec vitest run src/lib/minimap.test.ts`
Expected: PASS, 16 tests.

- [ ] **Paso 5: verificación de la tarea**

Run: `pnpm test > $S/t3.log 2>&1; tail -4 $S/t3.log; pnpm check > $S/c3.log 2>&1; grep -E "Result|error" $S/c3.log | tail -2`
Expected: todo en verde y 0 errores. Sin commit.

---

### Tarea 4: Zona del editor: pestañas y migas arriba, sin columna de índice

**Ficheros:**
- Crear: `web/src/components/EditorTabs.astro`
- Crear: `web/src/components/overrides/TwoColumnContent.astro`
- Crear: `web/src/components/overrides/PageSidebar.astro`
- Modificar: `web/src/components/overrides/PageTitle.astro` (se va la pestaña y las migas)
- Modificar: `web/astro.config.ts` (`components`)
- Modificar: `web/src/styles/theme.css` (variables; se van los estilos de pestaña, migas e índice derecho)

**Interfaces:**
- Consume: `currentLesson`, `pageFileName` y `phaseFolderName` (`~/lib/explorer`), `localizedHref`, `toLocale` y `readingMinutes`, como hasta ahora en `PageTitle`.
- Produce:
  - el marcado `.ide-editor-head` > `.ide-tabbar` > `.ide-tab`, y debajo `.ide-breadcrumbs`, solo dentro de una fase;
  - `.main-pane` como contenedor del editor;
  - la clase global `.ide-file-icon`;
  - las variables `--ide-tabbar-height`, `--ide-breadcrumbs-height`, `--ide-activity-width`, `--ide-gutter-width`, `--ide-measure`, `--ide-box-width` y `--ide-minimap-width`.

- [ ] **Paso 1: la comprobación, antes de cambiar nada**

Run:

```bash
pnpm build > $S/b4.log 2>&1; P=web/dist/fase-0/que-es-un-protocolo/index.html; H=web/dist/index.html
echo "cabecera del editor: $(grep -o 'class="ide-editor-head' $P | wc -l)"
echo "índice a la derecha: $(grep -o 'class="right-sidebar-panel' $P | wc -l)"
echo "índice móvil: $(grep -o 'id="starlight__mobile-toc"' $P | wc -l)"
echo "migas en la portada: $(grep -o 'class="ide-breadcrumbs' $H | wc -l)"
```

Expected (RED): cabecera del editor `0`, índice a la derecha `1`, índice móvil `1`, migas en la portada `0`.

- [ ] **Paso 2: la cabecera del editor**

Crea `web/src/components/EditorTabs.astro`:

```astro
---
/**
 * Arriba del editor, a todo el ancho y fijas al hacer scroll (desde 50rem): la pestaña con el
 * fichero abierto y, dentro de una fase, lo que la pestaña no dice: la fase y el tiempo de lectura.
 */
import { phases } from '~/data/phases';
import { currentLesson, pageFileName, phaseFolderName } from '~/lib/explorer';
import { localizedHref } from '~/lib/links';
import { toLocale } from '~/lib/locales';
import { readingMinutes } from '~/lib/reading';

const route = Astro.locals.starlightRoute;
const { entry } = route;
const locale = toLocale(route.locale);
const current = currentLesson(route.sidebar, phases, locale);
const fileName = pageFileName(route.id, entry.data.title, current?.position);
const minutes = entry.data.lesson ? readingMinutes(entry.body ?? '') : undefined;
---

<div class="ide-editor-head" data-pagefind-ignore>
  <div class="ide-tabbar print:hidden" aria-hidden="true">
    <span class="ide-tab"><span class="ide-file-icon">#</span>{fileName}</span>
  </div>
  {
    current && (
      <div class="ide-breadcrumbs">
        <nav aria-label={Astro.locals.t('breadcrumbs.label')}>
          <a
            href={localizedHref(locale, phaseFolderName(locale, current.phase.number))}
            aria-current={current.position.index === 0 ? 'page' : undefined}
          >
            {phaseFolderName(locale, current.phase.number)} {current.phase.title[locale]}
          </a>
        </nav>
        {minutes && <span>· {Astro.locals.t('reading.minutes', { minutes })}</span>}
      </div>
    )
  }
</div>

<style>
  .ide-editor-head {
    background: var(--ide-bg);
    font-family: var(--__sl-font-mono);
  }
  @media (min-width: 50rem) {
    .ide-editor-head {
      position: sticky;
      top: var(--sl-nav-height);
      z-index: 3;
    }
  }
  .ide-tabbar {
    display: flex;
    height: var(--ide-tabbar-height);
    background: var(--ide-chrome);
    border-bottom: 1px solid var(--ide-border);
    font-size: var(--sl-text-xs);
  }
  .ide-tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: -1px;
    padding: 0 1.125rem;
    border-top: 2px solid var(--ide-accent);
    border-inline-end: 1px solid var(--ide-border);
    background: var(--ide-bg);
    color: var(--ide-strong);
  }
  .ide-breadcrumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 1ch;
    min-height: var(--ide-breadcrumbs-height);
    padding: 0 1.25rem;
    font-size: var(--sl-text-2xs);
    color: var(--ide-muted);
  }
  .ide-breadcrumbs a {
    color: var(--ide-muted);
  }
</style>
```

- [ ] **Paso 3: la zona del editor y el índice móvil**

Crea `web/src/components/overrides/TwoColumnContent.astro`:

```astro
---
/**
 * La zona del editor: las pestañas y las migas arriba y, debajo, la página. Sustituye a la de
 * Starlight, que reserva una columna a la derecha para el índice: aquí el índice va en el
 * explorador (Sidebar.astro, sección ESQUEMA). El índice móvil sigue llegando por el slot
 * right-sidebar (PageSidebar.astro).
 */
import EditorTabs from '~/components/EditorTabs.astro';
---

{
  Astro.locals.starlightRoute.toc && (
    <aside class="print:hidden">
      <slot name="right-sidebar" />
    </aside>
  )
}
<div class="main-pane">
  <EditorTabs />
  <slot />
</div>

<style>
  /* Como en Starlight: la barra de estado (Footer.astro) cuenta con este contexto de apilamiento. */
  .main-pane {
    isolation: isolate;
  }
</style>
```

Crea `web/src/components/overrides/PageSidebar.astro`:

```astro
---
/**
 * Solo el índice móvil («En esta página», arriba), por debajo de 50rem. Desde 50rem, el índice va
 * en el explorador (Sidebar.astro, sección ESQUEMA).
 */
import MobileTableOfContents from '@astrojs/starlight/components/MobileTableOfContents.astro';
---

{
  Astro.locals.starlightRoute.toc && (
    <div class="md:sl-hidden">
      <MobileTableOfContents />
    </div>
  )
}
```

- [ ] **Paso 4: `PageTitle` se queda con el título y la entrada**

Sustituye `web/src/components/overrides/PageTitle.astro` entero por:

```astro
---
/**
 * El título y la entrada de la lección. La pestaña y las migas están en EditorTabs.astro, arriba
 * del editor.
 */
import Default from '@astrojs/starlight/components/PageTitle.astro';
import LessonIntro from '~/components/LessonIntro.astro';
import { isLessonId } from '~/lib/lessons';

const { entry } = Astro.locals.starlightRoute;
const { lesson } = entry.data;

if (isLessonId(entry.id) && !lesson) {
  throw new Error(
    `[lesson] "${entry.id}" es una lección y le falta el bloque "lesson" (oneLiner, objectives) en el frontmatter`,
  );
}
---

<Default />
{lesson && <LessonIntro lesson={lesson} />}
```

- [ ] **Paso 5: registrar las sustituciones**

En `web/astro.config.ts`, dentro de `components`, añade debajo de `PageTitle`:

```ts
        TwoColumnContent: './src/components/overrides/TwoColumnContent.astro',
        PageSidebar: './src/components/overrides/PageSidebar.astro',
```

- [ ] **Paso 6: variables y limpieza en `theme.css`**

En `web/src/styles/theme.css`:

1. Dentro del bloque `:root` de las variables de Starlight (el que termina en `--ide-statusbar-height: 1.75rem;`), añade después de esa línea:

```css
  /* Maqueta de editor (docs/specs/2026-10-03-maqueta-editor-design.md). */
  --sl-content-width: 100%;
  --sl-content-margin-inline: 0;
  --ide-activity-width: 3.25rem;
  --sl-sidebar-width: calc(var(--ide-activity-width) + 16rem);
  --ide-tabbar-height: 2.5rem;
  --ide-breadcrumbs-height: 1.875rem;
  --ide-gutter-width: 5rem;
  --ide-measure: 75ch;
  --ide-box-width: 51.25rem;
  --ide-minimap-width: 6rem;
```

2. Borra el bloque del índice derecho:

```css
/* Starlight solo fija el índice de la derecha a partir de 72rem; por debajo está en el flujo. */
@media (min-width: 72rem) {
  .right-sidebar {
    height: calc(100vh - var(--ide-statusbar-height));
  }
}
```

3. En la regla «Marco en monoespaciada», quita la línea `.right-sidebar,`.

4. Sustituye el bloque `/* Pestaña y migas. */` entero (las reglas `.ide-tabbar`, `.ide-tab`, `.ide-breadcrumbs` y `.ide-breadcrumbs a`) por el icono de fichero, que comparten la pestaña y el explorador:

```css
/* El icono de los ficheros (pestaña y explorador): una almohadilla, como la marca de Markdown. */
.ide-file-icon {
  display: inline-block;
  width: 1rem;
  font-weight: 700;
  text-align: center;
  color: var(--ide-info);
}
```

5. Borra el bloque `/* El índice de la derecha, como el panel de esquema de un editor. */` con su regla `.right-sidebar h2`.

- [ ] **Paso 7: ver que pasa**

Repite la comprobación del paso 1.
Expected (GREEN): cabecera del editor `1`, índice a la derecha `0`, índice móvil `1`, migas en la portada `0`. En `$S/b4.log`:
- «All internal links are valid.»;
- «[seo-audit] 24 páginas auditadas, sin problemas.»

Hasta la Tarea 5 el contenido se verá descolocado: ya no está centrado, pero aún le falta el hueco nuevo de los números. Es lo esperado.

- [ ] **Paso 8: verificación de la tarea**

Run: `pnpm test > $S/t4.log 2>&1; tail -4 $S/t4.log; pnpm check > $S/c4.log 2>&1; grep -E "Result|error" $S/c4.log | tail -2`
Expected: todo en verde y 0 errores. Sin commit.

---

### Tarea 5: Editor a lo ancho: números desde el título, anchos y línea resaltada

**Ficheros:**
- Modificar: `web/src/styles/theme.css` (bloques «Prosa legible» y «Números de línea»)

**Interfaces:**
- Consume: las variables de la Tarea 4, `--ide-line` (Tarea 1) y `.main-pane` (Tarea 4).
- Produce: el contador `ide-line` en `main`. Se numeran `h1#_top`, `.lesson-intro` y los hijos de `.sl-markdown-content`.

- [ ] **Paso 1: medir antes de cambiar nada**

Con la vista previa en marcha, abre `http://localhost:4323/fase-0/que-es-un-protocolo/` con Playwright a 1440 × 900. Ejecuta (`browser_evaluate`):

```js
() => {
  const pane = document.querySelector('.main-pane').getBoundingClientRect();
  const para = document.querySelector('.sl-markdown-content > p');
  const p = para.getBoundingClientRect();
  const table = document.querySelector('.sl-markdown-content > table').getBoundingClientRect();
  return { textoDesdeElBorde: Math.round(p.left - pane.left), anchoTexto: Math.round(p.width), maxTexto: getComputedStyle(para).maxWidth, anchoTabla: Math.round(table.width), anchoEditor: Math.round(pane.width) };
}
```

Expected (RED):
- `textoDesdeElBorde` mucho mayor que 80, porque la columna está centrada;
- `anchoTabla` igual o menor que unos 720.

- [ ] **Paso 2: anchos del contenido**

En `theme.css`, sustituye el bloque:

```css
/* Prosa legible. */
.sl-markdown-content {
  font-size: var(--sl-text-lg);
  line-height: 1.65;
}
.sl-markdown-content > :is(p, ul, ol) {
  max-width: 70ch;
}
```

por:

```css
/*
 * Prosa legible: el texto no pasa de unos 75 caracteres por línea. Las piezas anchas (tablas,
 * diagramas, código, terminales, laboratorios y la lista de fases) usan todo el editor. Las cajas
 * (entrada de la lección, analogía, autoevaluación…) se quedan en --ide-box-width. :where() deja
 * esta regla sin peso, para que la de la prosa mande sobre ella.
 */
.sl-markdown-content {
  font-size: var(--sl-text-lg);
  line-height: 1.65;
}
.sl-markdown-content
  > :where(:not(table, figure, .expressive-code, .try-it, astro-island, .phase-list)),
.lesson-intro {
  max-width: var(--ide-box-width);
}
.sl-markdown-content > :is(p, ul, ol, dl, blockquote):where(:not(.phase-list)) {
  max-width: var(--ide-measure);
}
```

- [ ] **Paso 3: el editor empieza en el borde, con los números desde el título**

Sustituye el bloque entero `/* Números de línea: un número por bloque de primer nivel, solo con espacio suficiente. */` (desde su `@media (min-width: 50rem) {` hasta su `}` de cierre) por:

```css
/*
 * El editor empieza en el borde del panel lateral: primero los números de línea y luego el texto,
 * alineado a la izquierda. El título es la línea 1; la entrada de la lección, la 2; luego, un número
 * por bloque. Solo con espacio suficiente (desde 50rem).
 */
@media (min-width: 50rem) {
  :root {
    /* El índice móvil solo existe por debajo de 50rem. */
    --sl-mobile-toc-height: 0rem;
    /* Un ancla (#seccion) no queda debajo de las pestañas fijas. */
    scroll-padding-top: calc(
      1.5rem + var(--sl-nav-height) + var(--ide-tabbar-height) + var(--ide-breadcrumbs-height)
    );
  }
  .main-pane .content-panel {
    padding-inline: var(--ide-gutter-width) 2.5rem;
  }
  /* Sin la raya que Starlight pone entre el título y el contenido. */
  .content-panel + .content-panel {
    border-top: 0;
  }
  main {
    counter-reset: ide-line;
  }
  h1#_top,
  .lesson-intro,
  .sl-markdown-content > * {
    counter-increment: ide-line;
    position: relative;
  }
  /*
   * No se numeran: las tablas y los diagramas hacen scroll (overflow) y recortarían su número,
   * y las islas de React (astro-island) no generan caja propia (display: contents), así que su
   * número saldría descolocado.
   */
  .sl-markdown-content > :is(table, figure.seq, figure.chain, astro-island) {
    counter-increment: none;
  }
  .sl-markdown-content > :is(table, figure.seq, figure.chain, astro-island)::before {
    content: none;
  }
  /* El título ya usa ::before para su «# »; su número va en ::after. */
  h1#_top::after,
  .lesson-intro::before,
  .sl-markdown-content > *::before {
    content: counter(ide-line) / '';
    position: absolute;
    top: 0;
    inset-inline-start: calc(-1 * var(--ide-gutter-width));
    width: 3.5rem;
    text-align: end;
    font-family: var(--__sl-font-mono);
    font-size: var(--sl-text-xs);
    font-weight: 400;
    line-height: inherit;
    color: var(--ide-gutter);
  }
  /* La entrada es una caja: su número, a la altura de su primera línea. */
  .lesson-intro::before {
    top: 1.125rem;
    line-height: calc(var(--sl-text-xl) * 1.5);
  }
}

/*
 * La línea actual, como en un editor: al pasar el ratón por un texto o un título, su fondo se
 * aclara de borde a borde. border-image con outset pinta fuera de la caja sin moverla, sin recortar
 * nada y sin crear scroll. Las cajas no se resaltan: ya tienen su propio borde.
 */
@media (min-width: 50rem) and (hover: hover) {
  h1#_top:hover,
  .sl-markdown-content
    > :is(p, ul, ol, dl, blockquote, .sl-heading-wrapper):where(:not(.phase-list)):hover {
    border-image-source: conic-gradient(var(--ide-line) 0 0);
    border-image-slice: 0 fill;
    border-image-outset: 0 100vmax;
  }
  h1#_top:hover::after,
  .sl-markdown-content
    > :is(p, ul, ol, dl, blockquote, .sl-heading-wrapper):where(:not(.phase-list)):hover::before {
    color: var(--ide-text);
  }
}
```

- [ ] **Paso 4: el formato**

Run: `pnpm format:check > $S/f5.log 2>&1; tail -3 $S/f5.log`
Expected: «All matched files use Prettier code style!». Si Prettier se queja de `theme.css`, ejecuta `pnpm exec prettier --write web/src/styles/theme.css` y repite.

- [ ] **Paso 5: medir después**

Run: `pnpm build > $S/b5.log 2>&1; grep -E "seo-audit|links are valid" $S/b5.log`
Expected: enlaces válidos y 24 páginas sin problemas.

Recarga la página del paso 1 y repite la medición.
Expected (GREEN):
- `textoDesdeElBorde` = 80, es decir `5rem`;
- `anchoTexto` igual a `maxTexto` (75ch en px), ±1: el editor es más ancho, así que el párrafo llega a su tope;
- `anchoTabla` = `anchoEditor` − 80 − 40, ±2 px.

- [ ] **Paso 6: un ancla no queda tapada (Review Focus 1)**

Navega a `http://localhost:4323/fase-0/que-es-un-protocolo/#la-anatomia-de-un-mensaje-http` a 1440 × 900 y ejecuta:

```js
() => {
  const head = document.querySelector('.ide-editor-head').getBoundingClientRect();
  const h = document.getElementById('la-anatomia-de-un-mensaje-http').getBoundingClientRect();
  return { pestañasAbajo: Math.round(head.bottom), tituloArriba: Math.round(h.top) };
}
```

Expected: `tituloArriba` ≥ `pestañasAbajo`.

Si el id del título es otro, cógelo del esquema con `document.querySelector('starlight-toc a[href*="anatom"]').hash`.

- [ ] **Paso 7: a la vista**

Haz una captura a 1440 × 900 y otra a 390 × 844, de la lección y de la portada, y compárala con la maqueta C:
- números pegados al borde;
- el título es la 1 y la entrada la 2;
- texto a la izquierda;
- tabla a todo el ancho;
- al pasar el ratón por un párrafo, banda de borde a borde.

En el móvil: sin números y con el índice «En esta página» arriba.

Borra las capturas después de listar la carpeta. Sin commit.

---

### Tarea 6: Cabecera, barra de actividad y panel lateral con esquema

**Ficheros:**
- Crear: `web/src/components/ActivityBar.astro`
- Crear: `web/src/components/overrides/Header.astro`
- Modificar: `web/src/components/overrides/Sidebar.astro` (entero)
- Modificar: `web/astro.config.ts` (`components`)
- Modificar: `web/src/content.config.ts`, `web/src/content/i18n/es.json` y `web/src/content/i18n/en.json`
- Modificar: `web/src/styles/theme.css` (panel lateral)

**Interfaces:**
- Consume:
  - de la Tarea 2: `THEME_KEY`, `EXPLORER_KEY`, `parseTheme`, `nextTheme`, `storedTheme`, `safeStorage`, `otherLocale`, `activityLinks` y `revealScrollTop`;
  - `languageTargets`, `translationsOf` y `getTranslationIndex`, como `LanguageSelect.astro`;
  - `.ide-file-icon` (Tarea 4).
- Produce:
  - en `<html>`, el atributo `data-ide-explorer="closed"` cuando el explorador está oculto;
  - `#ide-panels`;
  - las secciones `.ide-section--files` y `.ide-section--outline`;
  - los textos `activity.explorer`, `activity.roadmap` y `activity.glossary`, y el texto nuevo de `search.label`.

- [ ] **Paso 1: la comprobación, antes de cambiar nada**

Run:

```bash
pnpm build > $S/b6.log 2>&1; P=web/dist/fase-0/que-es-un-protocolo/index.html; H=web/dist/index.html
echo "barra de actividad: $(grep -o 'class="ide-activity ' $P | wc -l)"
echo "esquema en la lección: $(grep -o 'class="ide-section ide-section--outline' $P | wc -l)"
echo "esquema en la portada: $(grep -o 'class="ide-section ide-section--outline' $H | wc -l)"
echo "selector de idioma: $(grep -o '<starlight-lang-select' $P | wc -l)"
echo "selector de tema: $(grep -o '<starlight-theme-select' $P | wc -l)"
echo "grupo derecho de la cabecera: $(grep -o 'class="sl-hidden md:sl-flex print:hidden right-group' $P | wc -l)"
```

Expected (RED):
- barra de actividad `0`;
- esquema en la lección `0` y en la portada `0`;
- selector de idioma `2` (cabecera y menú móvil);
- selector de tema `2`;
- grupo derecho `1`.

- [ ] **Paso 2: los textos nuevos**

En `web/src/content.config.ts`, dentro de `extend: z.object({ … })` del esquema `i18n`, añade después de `'explorer.comingSoon': z.string(),`:

```ts
        'activity.explorer': z.string(),
        'activity.roadmap': z.string(),
        'activity.glossary': z.string(),
```

En `web/src/content/i18n/es.json`, después de `"explorer.comingSoon"`:

```json
  "activity.explorer": "Mostrar u ocultar el explorador",
  "activity.roadmap": "Temario",
  "activity.glossary": "Glosario",
  "search.label": "Buscar lección, término o comando",
```

En `web/src/content/i18n/en.json`, en el mismo sitio:

```json
  "activity.explorer": "Show or hide the explorer",
  "activity.roadmap": "Roadmap",
  "activity.glossary": "Glossary",
  "search.label": "Search lessons, terms or commands",
```

- [ ] **Paso 3: la barra de actividad**

Crea `web/src/components/ActivityBar.astro`:

```astro
---
/**
 * La barra de actividad, como la de un editor: a la izquierda del explorador y solo desde 50rem
 * (en el móvil, el tema y el idioma están en el menú). Cada icono es un control de verdad:
 * explorador (muestra u oculta el panel), buscar, temario, glosario, tema e idioma.
 */
import { activityLinks, otherLocale } from '~/lib/activity';
import { localeLabels, toLocale } from '~/lib/locales';
import { languageTargets } from '~/lib/route-fixes';
import { translationsOf } from '~/lib/translations';
import { getTranslationIndex } from '~/lib/translations-astro';

const route = Astro.locals.starlightRoute;
const t = Astro.locals.t;
const locale = toLocale(route.locale);
const other = otherLocale(locale);
const links = activityLinks(locale);
const languageHref = languageTargets(
  translationsOf(await getTranslationIndex(), route.entry.id),
)[other];
const currentIf = (href: string) => (Astro.url.pathname === href ? 'page' : undefined);
const themeLabels = {
  auto: t('themeSelect.auto'),
  dark: t('themeSelect.dark'),
  light: t('themeSelect.light'),
};
const themeLabel = t('themeSelect.accessibleLabel');
---

<div class="ide-activity sl-hidden md:sl-flex" data-pagefind-ignore>
  <div class="ide-activity__group">
    <button
      type="button"
      class="ide-activity__item"
      data-ide-explorer-toggle
      aria-controls="ide-panels"
      aria-expanded="true"
      aria-label={t('activity.explorer')}
      title={t('activity.explorer')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path>
        <path d="M14 3v5h5"></path>
      </svg>
    </button>
    <button
      type="button"
      class="ide-activity__item"
      data-ide-search
      aria-label={t('search.label')}
      title={t('search.label')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6"></circle>
        <path d="m20 20-4.5-4.5"></path>
      </svg>
    </button>
    <a
      class="ide-activity__item"
      href={links.roadmap}
      aria-current={currentIf(links.roadmap)}
      aria-label={t('activity.roadmap')}
      title={t('activity.roadmap')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"></path>
        <path d="M9 4v14M15 6v14"></path>
      </svg>
    </a>
    <a
      class="ide-activity__item"
      href={links.glossary}
      aria-current={currentIf(links.glossary)}
      aria-label={t('activity.glossary')}
      title={t('activity.glossary')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"></path>
        <path d="M5 17a3 3 0 0 1 3-3h11"></path>
      </svg>
    </a>
  </div>
  <div class="ide-activity__group">
    <button
      type="button"
      class="ide-activity__item"
      data-ide-theme
      data-choice="auto"
      data-label={themeLabel}
      data-labels={JSON.stringify(themeLabels)}
      aria-label={`${themeLabel}: ${themeLabels.auto}`}
      title={`${themeLabel}: ${themeLabels.auto}`}
    >
      <svg class="ide-theme-icon ide-theme-icon--auto" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="11" rx="2"></rect>
        <path d="M2 20h20"></path>
      </svg>
      <svg class="ide-theme-icon ide-theme-icon--dark" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"></path>
      </svg>
      <svg class="ide-theme-icon ide-theme-icon--light" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4"></circle>
        <path
          d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        ></path>
      </svg>
    </button>
    <a
      class="ide-activity__item ide-activity__lang"
      href={languageHref}
      hreflang={other}
      lang={other}
      aria-label={localeLabels[other]}
      title={localeLabels[other]}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path>
      </svg>
      <span aria-hidden="true">{other.toUpperCase()}</span>
    </a>
  </div>
</div>

<script>
  import {
    EXPLORER_KEY,
    THEME_KEY,
    nextTheme,
    parseTheme,
    safeStorage,
    storedTheme,
    type Theme,
  } from '~/lib/activity';

  const storage = safeStorage(() => window.localStorage);
  const root = document.documentElement;

  // Explorador: muestra u oculta el panel, como ⌘B en un editor. Se recuerda en este navegador.
  const toggle = document.querySelector<HTMLButtonElement>('[data-ide-explorer-toggle]');
  const syncExplorer = () =>
    toggle?.setAttribute('aria-expanded', String(root.dataset.ideExplorer !== 'closed'));
  syncExplorer();
  toggle?.addEventListener('click', () => {
    const close = root.dataset.ideExplorer !== 'closed';
    if (close) root.dataset.ideExplorer = 'closed';
    else delete root.dataset.ideExplorer;
    storage.set(EXPLORER_KEY, close ? 'closed' : '');
    syncExplorer();
  });

  // Buscar: abre el buscador de siempre (el botón de la cabecera).
  document.querySelector('[data-ide-search]')?.addEventListener('click', () => {
    document.querySelector<HTMLButtonElement>('site-search button[data-open-modal]')?.click();
  });

  // Tema: automático → oscuro → claro, con la clave del selector de Starlight.
  type ThemeProvider = { updatePickers(theme?: string): void };
  const themeButton = document.querySelector<HTMLButtonElement>('[data-ide-theme]');
  const labels = JSON.parse(themeButton?.dataset.labels ?? '{}') as Record<Theme, string>;
  const showTheme = (theme: Theme) => {
    if (!themeButton) return;
    const label = `${themeButton.dataset.label}: ${labels[theme]}`;
    themeButton.dataset.choice = theme;
    themeButton.setAttribute('aria-label', label);
    themeButton.title = label;
  };
  showTheme(parseTheme(storage.get(THEME_KEY)));
  themeButton?.addEventListener('click', () => {
    const theme = nextTheme(parseTheme(storage.get(THEME_KEY)));
    storage.set(THEME_KEY, storedTheme(theme));
    const prefersLight = matchMedia('(prefers-color-scheme: light)').matches;
    root.dataset.theme = theme === 'auto' ? (prefersLight ? 'light' : 'dark') : theme;
    (window as Window & { StarlightThemeProvider?: ThemeProvider }).StarlightThemeProvider?.updatePickers(
      theme,
    );
    showTheme(theme);
  });
</script>

<style>
  .ide-activity {
    flex: none;
    flex-direction: column;
    justify-content: space-between;
    width: var(--ide-activity-width);
    background: var(--ide-deep);
    border-inline-end: 1px solid var(--ide-border);
  }
  .ide-activity__group {
    display: flex;
    flex-direction: column;
  }
  .ide-activity__item {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 3rem;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ide-muted);
    font-family: var(--__sl-font-mono);
    text-decoration: none;
    cursor: pointer;
  }
  .ide-activity__item:hover,
  .ide-activity__item[aria-current='page'] {
    color: var(--ide-strong);
  }
  /* La marca de acento: el panel visible o la página abierta. */
  .ide-activity__item[aria-expanded='true']::before,
  .ide-activity__item[aria-current='page']::before {
    content: '';
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    width: 2px;
    background: var(--ide-accent);
  }
  .ide-activity svg {
    width: 1.5rem;
    height: 1.5rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .ide-activity__lang span {
    margin-top: 0.125rem;
    font-size: 0.625rem;
    font-weight: 700;
    line-height: 1;
  }
  .ide-theme-icon {
    display: none;
  }
  [data-choice='auto'] .ide-theme-icon--auto,
  [data-choice='dark'] .ide-theme-icon--dark,
  [data-choice='light'] .ide-theme-icon--light {
    display: block;
  }
</style>
```

- [ ] **Paso 4: la cabecera**

Crea `web/src/components/overrides/Header.astro`:

```astro
---
/**
 * La cabecera, como la barra de título de un editor: el nombre a la izquierda y el buscador en el
 * centro. El tema y el idioma no están aquí: en escritorio van en la barra de actividad
 * (ActivityBar.astro) y en el móvil, en el menú (MobileMenuFooter), como en Starlight.
 */
import Search from '@astrojs/starlight/components/Search.astro';
import SiteTitle from '~/components/overrides/SiteTitle.astro';
---

<div class="ide-header">
  <div class="ide-header__title">
    <SiteTitle />
  </div>
  <div class="ide-header__search print:hidden">
    <Search />
  </div>
  <div class="ide-header__end" aria-hidden="true"></div>
</div>

<style>
  .ide-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sl-nav-gap);
    height: 100%;
  }
  .ide-header__title {
    /* Como en Starlight: un nombre largo no tapa el buscador ni el botón del menú. */
    overflow: clip;
    min-width: 0;
    margin: -0.25rem;
    padding: 0.25rem;
  }
  .ide-header__end {
    display: none;
  }
  @media (min-width: 50rem) {
    .ide-header {
      display: grid;
      grid-template-columns: 1fr minmax(0, 32rem) 1fr;
    }
    .ide-header__end {
      display: block;
    }
    .ide-header__search :global(button[data-open-modal]) {
      width: 100%;
      max-width: none;
    }
  }
</style>
```

- [ ] **Paso 5: el panel lateral**

Sustituye `web/src/components/overrides/Sidebar.astro` entero por:

```astro
---
/**
 * El panel lateral, como el de un editor: la barra de actividad y, a su lado, dos secciones
 * plegables, el árbol de ficheros del curso y el esquema de la página. En el móvil (menú ☰) solo se
 * ven el árbol y, debajo, el tema y el idioma.
 */
import MobileMenuFooter from '@astrojs/starlight/components/MobileMenuFooter.astro';
import TableOfContents from '@astrojs/starlight/components/TableOfContents.astro';
import ActivityBar from '~/components/ActivityBar.astro';
import { phases } from '~/data/phases';
import { EXPLORER_KEY } from '~/lib/activity';
import { findPhaseLinks, homeFileName, phaseFolderName, toFileName, toKebab } from '~/lib/explorer';
import { localizedHref } from '~/lib/links';
import { toLocale } from '~/lib/locales';

const route = Astro.locals.starlightRoute;
const locale = toLocale(route.locale);
const t = Astro.locals.t;
const homeHref = localizedHref(locale);
const isHome = Astro.url.pathname === homeHref;
const workspace = toKebab(route.siteTitle).toUpperCase();
// Los enlaces sueltos del sidebar (temario, glosario) son los ficheros de la raíz.
const rootLinks = route.sidebar.filter((entry) => entry.type === 'link');
const folders = phases.map((phase) => ({
  phase,
  name: phaseFolderName(locale, phase.number),
  links:
    phase.status === 'available'
      ? findPhaseLinks(route.sidebar, phaseFolderName(locale, phase.number))
      : [],
}));
---

<script is:inline define:vars={{ explorerKey: EXPLORER_KEY }}>
  // Antes de pintar el editor: si el lector ocultó el explorador, la página empieza ya sin él.
  try {
    if (localStorage.getItem(explorerKey) === 'closed') {
      document.documentElement.dataset.ideExplorer = 'closed';
    }
  } catch {}
</script>

<div class="ide-side">
  <ActivityBar />
  <div class="ide-panels" id="ide-panels">
    <p class="ide-panels__title" aria-hidden="true">{t('explorer.title')}</p>
    <details class="ide-section ide-section--files" open>
      <summary class="ide-section__summary">
        <svg class="ide-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6"></path>
        </svg>
        {workspace}
      </summary>
      <nav class="explorer" aria-label={t('explorer.title')}>
        <ul class="explorer__list" role="list">
          <li>
            <a
              class="explorer__file"
              href={homeHref}
              aria-current={isHome ? 'page' : undefined}
              aria-label={route.siteTitle}
              title={route.siteTitle}
            >
              <span class="ide-file-icon" aria-hidden="true">#</span>{homeFileName(locale)}
            </a>
          </li>
          {
            rootLinks.map((link) => (
              <li>
                <a
                  class="explorer__file"
                  href={link.href}
                  aria-current={link.isCurrent ? 'page' : undefined}
                  aria-label={link.label}
                  title={link.label}
                >
                  <span class="ide-file-icon" aria-hidden="true">
                    #
                  </span>
                  {toFileName(link.label)}
                </a>
              </li>
            ))
          }
          {
            folders.map(({ phase, name, links }) =>
              links.length > 0 ? (
                <li>
                  <details class="explorer__folder" open>
                    <summary title={phase.title[locale]}>
                      <svg class="ide-chevron" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                      <span class="explorer__name">{name}</span>{' '}
                      <span class="explorer__hint">{phase.title[locale]}</span>
                    </summary>
                    <ul class="explorer__list" role="list">
                      {links.map((link, index) => (
                        <li>
                          <a
                            class="explorer__file explorer__file--nested"
                            href={link.href}
                            aria-current={link.isCurrent ? 'page' : undefined}
                            aria-label={link.label}
                            title={link.label}
                          >
                            <span class="ide-file-icon" aria-hidden="true">
                              #
                            </span>
                            {toFileName(link.label, index)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ) : (
                <li class="explorer__folder explorer__folder--soon" title={phase.title[locale]}>
                  <svg class="ide-chevron ide-chevron--closed" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                  <span class="explorer__name">{name}</span>{' '}
                  <span class="explorer__hint">{phase.title[locale]}</span>
                  <span class="sr-only"> ({t('explorer.comingSoon')})</span>
                </li>
              ),
            )
          }
        </ul>
      </nav>
    </details>
    {
      route.toc && (
        <details class="ide-section ide-section--outline sl-hidden md:sl-block" open>
          <summary class="ide-section__summary">
            <svg class="ide-chevron" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
            {t('tableOfContents.onThisPage')}
          </summary>
          <div class="ide-outline">
            <TableOfContents />
          </div>
        </details>
      )
    }
  </div>
</div>

<div class="md:sl-hidden">
  <MobileMenuFooter />
</div>

<script>
  import { revealScrollTop } from '~/lib/explorer';

  // Como en un editor, el fichero abierto se ve en el árbol aunque esté muy abajo.
  const scroller = document.querySelector<HTMLElement>('.ide-section--files');
  const current = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
  if (scroller && current && matchMedia('(min-width: 50rem)').matches) {
    const top =
      current.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTop = revealScrollTop(
      { scrollTop: scroller.scrollTop, height: scroller.clientHeight },
      { top, height: current.offsetHeight },
    );
  }
</script>

<style>
  .ide-side {
    font-family: var(--__sl-font-mono);
  }
  .ide-panels__title {
    margin: 0;
    padding: 0.875rem 1.25rem 0.5rem;
    font-size: var(--sl-text-2xs);
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ide-muted);
  }
  .ide-section__summary {
    display: block;
    padding: 0.3rem 0.5rem;
    list-style: none;
    cursor: pointer;
    background: var(--ide-chrome);
    font-size: var(--sl-text-2xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ide-text);
  }
  .ide-section--outline {
    border-top: 1px solid var(--ide-border);
  }
  summary::-webkit-details-marker {
    display: none;
  }
  .ide-chevron {
    width: 1rem;
    height: 1rem;
    margin-inline-end: 0.25rem;
    vertical-align: -0.2em;
    fill: none;
    stroke: var(--ide-muted);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  details:not([open]) > summary > .ide-chevron,
  .ide-chevron--closed {
    transform: rotate(-90deg);
  }
  .explorer {
    padding-bottom: 0.5rem;
    font-size: var(--sl-text-sm);
    line-height: 1.5;
  }
  .explorer__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  /* Como en un editor: una línea por entrada, recortada con «…»; el nombre completo va en title. */
  .explorer__file,
  .explorer__folder summary,
  .explorer__folder--soon {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .explorer__file {
    padding: 0.2rem 0.5rem 0.2rem 1.75rem;
    color: var(--ide-text);
    text-decoration: none;
  }
  .explorer__file .ide-file-icon {
    margin-inline-end: 0.375rem;
  }
  .explorer__file:hover {
    background: var(--ide-selection);
    color: var(--ide-strong);
  }
  .explorer__file[aria-current='page'] {
    background: var(--ide-selection);
    color: var(--ide-strong);
    box-shadow: inset 2px 0 0 var(--ide-accent);
  }
  .explorer__folder summary {
    padding: 0.2rem 0.5rem;
    list-style: none;
    cursor: pointer;
    color: var(--ide-text);
  }
  /* La guía de sangría de una carpeta abierta. */
  .explorer__folder > .explorer__list {
    margin-inline-start: 0.95rem;
    border-inline-start: 1px solid var(--ide-border);
  }
  .explorer__file--nested {
    padding-inline-start: 0.75rem;
  }
  .explorer__name {
    color: var(--ide-accent);
  }
  .explorer__hint {
    color: var(--ide-muted);
  }
  .explorer__folder--soon {
    /* Contiene el texto .sr-only (posición absoluta) dentro de la fila recortada. */
    position: relative;
    padding: 0.2rem 0.5rem;
    color: var(--ide-muted);
  }
  .explorer__folder--soon .explorer__name {
    color: var(--ide-muted);
  }
  /* El esquema: el índice de Starlight, con el nivel delante, como los símbolos de un editor. */
  .ide-outline :global(h2) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .ide-outline :global(ul) {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ide-outline :global(a) {
    display: block;
    padding: 0.2rem 0.75rem 0.2rem 1.75rem;
    border-radius: 0;
    font-size: var(--sl-text-xs);
    line-height: 1.5;
    color: var(--ide-text);
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ide-outline :global(ul ul a) {
    padding-inline-start: 2.75rem;
  }
  .ide-outline :global(a:hover) {
    background: var(--ide-selection);
    color: var(--ide-strong);
  }
  .ide-outline :global(a[aria-current='true']) {
    color: var(--ide-accent);
  }
  .ide-outline :global(nav > ul > li > a::before) {
    content: '## ' / '';
    color: var(--ide-keyword);
  }
  .ide-outline :global(nav > ul > li > a[href='#_top']::before) {
    content: '# ' / '';
  }
  .ide-outline :global(ul ul a::before) {
    content: '### ' / '';
    color: var(--ide-keyword);
  }
</style>
```

- [ ] **Paso 6: el panel ocupa todo el alto, y el explorador se puede ocultar**

En `web/src/styles/theme.css`, justo después del bloque que da a `.sidebar-pane` el hueco de la barra de estado (`@media (min-width: 50rem) { .sidebar-pane { inset-block-end: … } }`), añade:

```css
/*
 * Panel lateral (Sidebar.astro): la barra de actividad y las dos secciones ocupan todo el alto, y
 * cada sección abierta hace su propio scroll (explorador 58 %, esquema 42 %). Si el lector oculta
 * el explorador, queda solo la barra de actividad y el editor gana ese ancho. En el móvil, el menú
 * enseña el árbol siempre.
 */
@media (min-width: 50rem) {
  .sidebar-pane {
    overflow: hidden;
  }
  .sidebar-content {
    min-height: 0;
    padding: 0;
    gap: 0;
  }
  .ide-side {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .ide-panels {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .ide-section[open] {
    flex: 1 1 58%;
    min-height: 0;
    overflow-y: auto;
  }
  .ide-section--outline[open] {
    flex-basis: 42%;
  }
  .ide-section:not([open]) {
    flex: none;
  }
  .ide-section__summary {
    position: sticky;
    top: 0;
    z-index: 1;
  }
  :root[data-ide-explorer='closed'] {
    --sl-sidebar-width: var(--ide-activity-width);
  }
  :root[data-ide-explorer='closed'] .ide-panels {
    display: none;
  }
}
```

- [ ] **Paso 7: registrar la cabecera**

En `web/astro.config.ts`, dentro de `components`, añade:

```ts
        Header: './src/components/overrides/Header.astro',
```

- [ ] **Paso 8: tipos y formato**

Run: `pnpm check > $S/c6.log 2>&1; grep -E "Result|error" $S/c6.log | tail -3; pnpm format:check > $S/f6.log 2>&1; tail -2 $S/f6.log`
Expected: 0 errores y formato correcto. Si Prettier se queja, `pnpm exec prettier --write` sobre los ficheros que nombre, y repite.

- [ ] **Paso 9: ver que pasa (Review Focus 4)**

Repite la comprobación del paso 1.
Expected (GREEN):
- barra de actividad `1`;
- esquema en la lección `1` y en la portada `0`;
- selector de idioma `1` (solo el del menú móvil, que la auditoría sigue leyendo);
- selector de tema `1`;
- grupo derecho `0`.

En `$S/b6.log`, enlaces válidos y «24 páginas auditadas, sin problemas».

- [ ] **Paso 10: en el navegador**

Con la vista previa, en `http://localhost:4323/fase-0/que-es-un-protocolo/` a 1440 × 900:

1. **Explorador.** Pulsa el botón del explorador y ejecuta:
   ```js
   () => ({
     cerrado: document.documentElement.dataset.ideExplorer,
     margen: getComputedStyle(document.querySelector('.main-frame')).paddingInlineStart,
     expandido: document.querySelector('[data-ide-explorer-toggle]').getAttribute('aria-expanded'),
   })
   ```
   Expected: `{ cerrado: 'closed', margen: '52px', expandido: 'false' }`. Recarga la página. Expected: sigue cerrado, sin parpadeo del panel.
2. **Móvil con el explorador cerrado (Review Focus 5).** Sin volver a abrirlo, cambia a 390 × 844 y abre el menú ☰. Expected: el árbol se ve entero, y debajo, el tema y el idioma. Vuelve a 1440 y ábrelo otra vez con el botón.
3. **Tema.** Pulsa el botón del tema tres veces y anota cada vez `document.documentElement.dataset.theme` y `localStorage.getItem('starlight-theme')`. Expected: oscuro (`'dark'`), claro (`'light'`) y automático (`''`). El icono y el `aria-label` del botón cambian con cada pulsación.
4. **Buscar.** Pulsa el botón de buscar. Expected: `document.querySelector('site-search dialog').open === true`. Ciérralo con Escape.
5. **Idioma.** El enlace de idioma lleva a `/en/phase-0/what-is-a-protocol/`.
6. **Esquema.** Pulsa un elemento del esquema. Expected: salta a esa sección, y al hacer scroll se marca en naranja la sección actual.
7. **Árbol largo.** En `http://localhost:4323/fase-0/que-pasa-cuando-escribes-una-url/`, la última lección, el fichero abierto se ve en el árbol sin hacer scroll.
8. **Sin índice (Review Focus 4).** En `http://localhost:4323/`, no hay sección ESQUEMA y el árbol ocupa todo el alto.
9. **Teclado.** Desde la barra de dirección, el tabulador recorre: enlace de salto, cabecera, botones de la barra de actividad (con el foco visible) y el árbol.

Haz capturas a 1440 en oscuro y en claro, y compáralas con la maqueta C. Bórralas después de listar la carpeta. Sin commit.

---

### Tarea 7: Minimapa

**Ficheros:**
- Crear: `web/src/components/Minimap.astro`
- Modificar: `web/src/components/overrides/TwoColumnContent.astro` (añadir `<Minimap />`)
- Modificar: `web/src/styles/theme.css` (hueco del minimapa)

**Interfaces:**
- Consume:
  - de la Tarea 3: `blockKind`, `layoutBars`, `minimapScale`, `scrollTargetFor`, `viewportRect` y `Block`;
  - `--ide-minimap-width`, `--ide-tabbar-height` y `--ide-breadcrumbs-height` (Tarea 4).
- Produce: `.ide-minimap`, visible desde 82rem.

- [ ] **Paso 1: la comprobación, antes de cambiar nada**

Run: `pnpm build > $S/b7.log 2>&1; echo "minimapa: $(grep -o 'class="ide-minimap print:hidden"' web/dist/fase-0/que-es-un-protocolo/index.html | wc -l)"`
Expected (RED): `minimapa: 0`. (Se busca la clase entera: `class="ide-minimap` a secas también contaría `ide-minimap__bars` e `ide-minimap__view`.)

- [ ] **Paso 2: el componente**

Crea `web/src/components/Minimap.astro`:

```astro
---
/**
 * El minimapa: un plano de la página a la derecha del editor, solo desde 82rem. Cada bloque del
 * contenido es una barra (los títulos en morado y el código en verde) y el rectángulo marca lo que
 * se ve; al pulsar o arrastrar, la página salta ahí. Para la accesibilidad es decorativo: el
 * esquema del explorador hace lo mismo con teclado. La lógica, con tests: src/lib/minimap.ts.
 */
---

<div class="ide-minimap print:hidden" aria-hidden="true" data-pagefind-ignore>
  <div class="ide-minimap__bars"></div>
  <div class="ide-minimap__view"></div>
</div>

<script>
  import {
    blockKind,
    layoutBars,
    minimapScale,
    scrollTargetFor,
    viewportRect,
    type Block,
  } from '~/lib/minimap';

  const wide = matchMedia('(min-width: 82rem)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const map = document.querySelector<HTMLElement>('.ide-minimap');
  const bars = map?.querySelector<HTMLElement>('.ide-minimap__bars');
  const view = map?.querySelector<HTMLElement>('.ide-minimap__view');
  const content = document.querySelector<HTMLElement>('.sl-markdown-content');
  let scale = 0;

  /** El título, la entrada de la lección y cada bloque del contenido, medidos en el documento. */
  function measureBlocks(): Block[] {
    const elements = [
      document.getElementById('_top'),
      document.querySelector('.lesson-intro'),
      ...(content ? Array.from(content.children) : []),
    ].filter((el): el is HTMLElement => el instanceof HTMLElement);
    const contentWidth = content?.clientWidth || 1;
    return elements.map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        top: rect.top + window.scrollY,
        height: rect.height,
        width: rect.width / contentWidth,
        kind: blockKind(el.tagName, Array.from(el.classList)),
      };
    });
  }

  function moveView() {
    if (!view) return;
    const rect = viewportRect(window.scrollY, window.innerHeight, scale);
    view.style.transform = `translateY(${rect.top}px)`;
    view.style.height = `${rect.height}px`;
  }

  function draw() {
    if (!map || !bars || !wide.matches) return;
    scale = minimapScale(document.documentElement.scrollHeight, map.clientHeight);
    bars.replaceChildren(
      ...layoutBars(measureBlocks(), scale).map((bar) => {
        const el = document.createElement('div');
        el.className = `ide-minimap__bar ide-minimap__bar--${bar.kind}`;
        el.style.top = `${bar.top}px`;
        el.style.height = `${bar.height}px`;
        el.style.width = `${bar.width * 100}%`;
        return el;
      }),
    );
    moveView();
  }

  function jump(event: PointerEvent, smooth: boolean) {
    if (!map) return;
    const mapY = event.clientY - map.getBoundingClientRect().top;
    const top = scrollTargetFor(
      mapY,
      scale,
      window.innerHeight,
      document.documentElement.scrollHeight,
    );
    window.scrollTo({ top, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'auto' });
  }

  let frame = 0;
  window.addEventListener(
    'scroll',
    () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        moveView();
      });
    },
    { passive: true },
  );
  map?.addEventListener('pointerdown', (event) => {
    map.setPointerCapture(event.pointerId);
    jump(event, true);
  });
  map?.addEventListener('pointermove', (event) => {
    if (map.hasPointerCapture(event.pointerId)) jump(event, false);
  });
  if (content) new ResizeObserver(draw).observe(content);
  window.addEventListener('resize', draw);
  wide.addEventListener('change', draw);
  draw();
</script>

<style is:global>
  .ide-minimap {
    display: none;
  }
  @media (min-width: 82rem) {
    .ide-minimap {
      position: fixed;
      z-index: 2;
      inset-block: calc(
          var(--sl-nav-height) + var(--ide-tabbar-height) + var(--ide-breadcrumbs-height)
        )
        var(--ide-statusbar-height);
      inset-inline-end: 0;
      display: block;
      width: var(--ide-minimap-width);
      overflow: hidden;
      background: var(--ide-bg);
      box-shadow: inset 1px 0 0 var(--ide-border);
      cursor: pointer;
      touch-action: none;
    }
  }
  .ide-minimap__bars {
    position: absolute;
    inset: 0 0.75rem;
  }
  .ide-minimap__bar {
    position: absolute;
    left: 0;
    border-radius: 1px;
    background: var(--ide-gutter);
  }
  .ide-minimap__bar--heading {
    background: var(--ide-keyword);
  }
  .ide-minimap__bar--code {
    background: var(--ide-string);
  }
  .ide-minimap__view {
    position: absolute;
    top: 0;
    inset-inline: 0;
    background: color-mix(in srgb, var(--ide-text) 8%, transparent);
  }
</style>
```

- [ ] **Paso 3: montarlo en el editor**

En `web/src/components/overrides/TwoColumnContent.astro`:
- añade `import Minimap from '~/components/Minimap.astro';` debajo de la importación de `EditorTabs`;
- añade `<Minimap />` justo después del `</div>` de `.main-pane`.

- [ ] **Paso 4: el texto no se mete debajo del minimapa**

En `web/src/styles/theme.css`, justo después del bloque `@media (min-width: 50rem)` del editor (Tarea 5, paso 3), añade:

```css
/* Desde 82rem, el minimapa ocupa el borde derecho: el contenido termina antes. */
@media (min-width: 82rem) {
  .main-pane .content-panel {
    padding-inline-end: calc(2.5rem + var(--ide-minimap-width));
  }
}
```

- [ ] **Paso 5: ver que pasa**

Run: `pnpm build > $S/b7.log 2>&1; echo "minimapa: $(grep -o 'class="ide-minimap print:hidden"' web/dist/fase-0/que-es-un-protocolo/index.html | wc -l)"; grep -E "seo-audit|links are valid|JavaScript más pesado" $S/b7.log`
Expected (GREEN):
- `minimapa: 1`;
- enlaces válidos;
- 24 páginas sin problemas;
- el JavaScript más pesado sigue por debajo de 400 KB (antes, 339 KB).

- [ ] **Paso 6: en el navegador (Review Focus 3)**

En `http://localhost:4323/fase-0/que-es-un-protocolo/` a 1440 × 900:

```js
() => {
  const map = document.querySelector('.ide-minimap');
  const view = document.querySelector('.ide-minimap__view').getBoundingClientRect();
  return { visible: getComputedStyle(map).display, barras: map.querySelectorAll('.ide-minimap__bar').length, rectanguloDentro: view.bottom <= map.getBoundingClientRect().bottom + 1 };
}
```

Expected: `visible: 'block'`, `barras` > 20 y `rectanguloDentro: true`.

Pulsa cerca del final del minimapa. Expected: `window.scrollY` pasa a ser grande, porque la página baja hasta esa zona. Arrastra hacia arriba. Expected: la página sube contigo.

Repite la medición en `http://localhost:4323/` (la portada, más corta). Expected: barras proporcionadas, sin bloques gigantes, y `rectanguloDentro: true`.

A 1280 × 800 (por debajo de 82rem): `getComputedStyle(document.querySelector('.ide-minimap')).display === 'none'`, y el texto llega hasta el margen derecho normal.

Haz una captura a 1440 en oscuro y otra en claro. Bórralas después de listar la carpeta.

- [ ] **Paso 7: verificación de la tarea**

Run: `pnpm test > $S/t7.log 2>&1; tail -4 $S/t7.log; pnpm check > $S/c7.log 2>&1; grep -E "Result|error" $S/c7.log | tail -2; pnpm format:check > $S/f7.log 2>&1; tail -2 $S/f7.log`
Expected: todo en verde, 0 errores y formato correcto. Sin commit.

---

### Tarea 8: Documentación y verificación final

**Ficheros:**
- Modificar: `docs/specs/2026-10-03-maqueta-editor-design.md` (estado)
- Modificar: `docs/specs/2026-10-02-tema-ide-design.md` (nota al principio)
- Modificar: `docs/style-guide.md` (sección «Tema (editor de código)»)
- Modificar: `CLAUDE.md` («Decisiones ya tomadas»)
- Modificar: `docs/pendientes.md`

- [ ] **Paso 1: la spec, implementada**

En `docs/specs/2026-10-03-maqueta-editor-design.md`, sustituye la línea de **Estado** por:

```markdown
**Estado:** aprobado por el autor el 2026-10-03 e implementado (plan: `docs/plans/2026-10-03-maqueta-editor.md`).
```

- [ ] **Paso 2: la spec del tema remite a la nueva**

En `docs/specs/2026-10-02-tema-ide-design.md`, debajo del título, añade:

```markdown
> **2026-10-03:** la maqueta (cabecera, panel lateral, pestañas y migas, índice, anchos del contenido, números de línea y barra de estado) la sustituye `docs/specs/2026-10-03-maqueta-editor-design.md`. Los colores, la tipografía y los componentes de lección siguen aquí.
```

- [ ] **Paso 3: la guía de estilo**

En `docs/style-guide.md`, al final de la lista de la sección «Tema (editor de código)», añade:

```markdown
- **Anchos:**
  - la prosa (párrafos, listas, `dl` y citas) llega como mucho a `--ide-measure` (75ch);
  - las cajas, a `--ide-box-width`;
  - las piezas anchas usan todo el editor: tablas, `figure`, bloques de código, `TryIt`, laboratorios (`astro-island`) y la lista de fases.
  Un componente nuevo que necesite ancho se añade a esa lista en `theme.css` («Prosa legible»).
- **Números de línea:** el título es la 1 y la entrada de la lección, la 2. Las piezas que hacen scroll (tablas, diagramas de secuencia y de cadena, laboratorios) no llevan número.
- **Minimapa:** dibuja el título, la entrada y cada bloque de primer nivel del contenido. Si un componente nuevo es código o terminal, añádelo a `blockKind` (`web/src/lib/minimap.ts`) para que salga en verde.
- **Barra de actividad y panel lateral:**
  - el tema y el idioma están en la barra de actividad (escritorio) y en el menú (móvil), no en la cabecera;
  - el esquema de la página está en el explorador;
  - las claves de `localStorage` son `starlight-theme` e `ide-explorer`.
```

- [ ] **Paso 4: `CLAUDE.md`**

En «Decisiones ya tomadas», debajo de la línea del diseño visual, añade:

```markdown
- Maqueta de editor (diseño C: barra de actividad, esquema en el explorador, minimapa, barra de estado discreta): `docs/specs/2026-10-03-maqueta-editor-design.md`.
```

- [ ] **Paso 5: `docs/pendientes.md`**

Sustituye el punto de «Maqueta de editor (diseño C)» de «Decisiones» por:

```markdown
- [x] **Maqueta de editor (diseño C):** elegida el 2026-10-03 sobre los bocetos e implementada (spec: `docs/specs/2026-10-03-maqueta-editor-design.md`).
- [ ] **Revisar la maqueta en tu navegador:** en oscuro y en claro, en el portátil y en el móvil. Prueba a ocultar el explorador, el botón de tema, el esquema y el minimapa.
```

- [ ] **Paso 6: verificación final**

Run:

```bash
pnpm test > $S/t8.log 2>&1; tail -4 $S/t8.log
pnpm check > $S/c8.log 2>&1; grep -E "Result|error" $S/c8.log | tail -2
rm -rf web/dist && pnpm build > $S/b8.log 2>&1; grep -E "drop-fallbacks|seo-audit|links are valid|JavaScript más pesado" $S/b8.log
pnpm format:check > $S/f8.log 2>&1; tail -2 $S/f8.log
```

Expected:
- todos los tests en verde (los 371 de antes más los nuevos);
- 0 errores de tipos;
- «9 copias de respaldo borradas», enlaces válidos y «24 páginas auditadas, sin problemas»;
- formato correcto.

- [ ] **Paso 7: un último repaso en el navegador**

Haz capturas a 1440 × 900, 1000 × 800 y 390 × 844, en oscuro y en claro, de la lección 2, la portada y el glosario. Compáralas con la maqueta C. A 1000 se ven la barra de actividad y el panel, pero no el minimapa. Lista la carpeta de capturas y bórralas. Sin commit.
