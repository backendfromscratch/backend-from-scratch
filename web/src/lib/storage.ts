/**
 * Lo que la interfaz recuerda en el navegador del lector. localStorage puede no existir o lanzar
 * (navegación privada, datos bloqueados, cuota llena): entonces todo sigue funcionando, solo que
 * sin recordar nada.
 */

import type { Locale } from './locales';

/** 'open' si el lector ha abierto el ESQUEMA (empieza plegado); vacío si no. */
export const OUTLINE_KEY = 'ide-outline';

/** Las carpetas de fase que el lector ha abierto o plegado: { «fase-1»: true, … }. */
export const FOLDERS_KEY = 'ide-folders';

/**
 * La última página abierta (que no sea una pestaña fijada), por idioma: la primera pestaña de los
 * playgrounds y del glosario enlaza a ella (EditorTabs.astro).
 */
export function lastPageKey(locale: Locale): string {
  return `ide-last-page:${locale}`;
}

export interface SafeStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

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
