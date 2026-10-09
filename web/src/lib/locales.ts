export const locales = ['es', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'es';

/** Nombre de cada idioma en el selector de idioma. */
export const localeLabels: Record<Locale, string> = { es: 'Español', en: 'English' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/**
 * Convierte el locale de Starlight en un Locale del curso. El español es el idioma raíz (sin prefijo
 * en la URL), y Starlight lo representa como `undefined`.
 */
export function toLocale(value: string | undefined): Locale {
  if (value === undefined) return defaultLocale;
  if (!isLocale(value)) {
    throw new Error(
      `[locales] Idioma desconocido: "${value}". Los idiomas válidos son: ${locales.join(', ')}`,
    );
  }
  return value;
}
