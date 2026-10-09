/**
 * Índice de traducciones: une cada página con su traducción aunque sus rutas sean distintas
 * (/fase-0/que-es-dns/ ↔ /en/phase-0/what-is-dns/). Starlight no sabe hacerlo: deduce la traducción
 * cambiando el prefijo de idioma de la URL. Lógica pura; src/lib/translations-astro.ts la alimenta
 * con la colección de contenido.
 */
import type { Locale } from './locales';

export interface DocRef {
  id: string;
  translationKey?: string | undefined;
}

export interface TranslationIndex {
  /** Clave de traducción → id de la página en cada idioma. */
  byKey: Map<string, Partial<Record<Locale, string>>>;
  /** Id de cada página → su clave. */
  keyById: Map<string, string>;
}

/** Astro llama "index" a la portada de la raíz y Starlight la normaliza a "". Aquí siempre es "". */
export function normalizeId(id: string): string {
  return id === 'index' ? '' : id;
}

/** El inglés vive en la carpeta en/; el español, en la raíz. */
export function localeOfId(id: string): Locale {
  return normalizeId(id).split('/')[0] === 'en' ? 'en' : 'es';
}

/** La URL pública de una página: '' → '/', 'fase-0/que-es-dns' → '/fase-0/que-es-dns/'. */
export function urlOfId(id: string): string {
  const clean = normalizeId(id);
  return clean ? `/${clean}/` : '/';
}

/** La clave que une la página con su traducción: translationKey o, si no hay, su ruta sin idioma. */
export function translationKeyOf(doc: DocRef): string {
  return doc.translationKey ?? normalizeId(doc.id).replace(/^en(?:\/|$)/, '');
}

/** Las páginas de una fase (fase-N/… y en/phase-N/…) tienen rutas distintas en cada idioma. */
const PHASE_PAGE = /^(?:fase-\d+|en\/phase-\d+)(?:\/|$)/;
/** Una lección dentro de una fase; el grupo 1 es la carpeta de la fase. */
const LESSON_IN_PHASE = /^((?:fase-\d+|en\/phase-\d+))\/[^/]+$/;

export function buildTranslationIndex(docs: readonly DocRef[]): TranslationIndex {
  const byKey = new Map<string, Partial<Record<Locale, string>>>();
  const keyById = new Map<string, string>();
  for (const doc of docs) {
    const id = normalizeId(doc.id);
    // Sin clave, una página de una fase se quedaría sin pareja (sin hreflang ni selector) sin avisar.
    if (PHASE_PAGE.test(id) && doc.translationKey === undefined) {
      throw new Error(
        `[translations] "${id}" no tiene translationKey. Las páginas de una fase la necesitan para unirse con su traducción (la misma en los dos idiomas).`,
      );
    }
    const key = translationKeyOf(doc);
    const locale = localeOfId(id);
    const pair = byKey.get(key) ?? {};
    const other = pair[locale];
    if (other !== undefined) {
      throw new Error(
        `[translations] "${other}" y "${id}" tienen la misma clave de traducción ("${key}") en el mismo idioma. Cambia la translationKey de una de las dos.`,
      );
    }
    pair[locale] = id;
    byKey.set(key, pair);
    keyById.set(id, key);
  }
  // Una lección necesita la introducción de su fase en su idioma: el explorador numera las páginas
  // de la fase por su orden, y sin la introducción la primera lección pasaría a ser la «00».
  for (const id of keyById.keys()) {
    const phase = LESSON_IN_PHASE.exec(id)?.[1];
    if (phase !== undefined && !keyById.has(phase)) {
      throw new Error(
        `[translations] "${id}" es una lección, pero su fase no tiene introducción en ese idioma ("${phase}"). Crea primero la introducción.`,
      );
    }
  }
  return { byKey, keyById };
}

/** Las URLs de la página `id` en cada idioma en que existe. */
export function translationsOf(
  index: TranslationIndex,
  id: string,
): Partial<Record<Locale, string>> {
  const key = index.keyById.get(normalizeId(id));
  const pair = key === undefined ? {} : (index.byKey.get(key) ?? {});
  return Object.fromEntries(
    Object.entries(pair).map(([locale, pageId]) => [locale, urlOfId(pageId)]),
  );
}

/** El id que Astro da a un fichero de src/content/docs: en minúsculas, sin extensión y sin el /index final. */
export function idFromContentPath(relativePath: string): string {
  const id = relativePath.replace(/\.mdx?$/, '').toLowerCase();
  return id === 'index' ? id : id.replace(/\/index$/, '');
}

/**
 * Las copias de respaldo que genera Starlight: para cada página en español, una en /en/ con la misma
 * ruta si en inglés no existe esa ruta. Con rutas traducidas, Starlight no sabe que la traducción
 * existe con otra ruta, y habría una copia por lección.
 */
export function fallbackUrls(ids: readonly string[]): string[] {
  const existing = new Set(ids.map(normalizeId));
  return [...existing]
    .filter((id) => localeOfId(id) === 'es')
    .map((id) => (id ? `en/${id}` : 'en'))
    .filter((englishId) => !existing.has(englishId))
    .map(urlOfId);
}
