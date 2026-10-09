export const locales = ['es', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'es';

/** Name of each language in the language selector. */
export const localeLabels: Record<Locale, string> = { es: 'Español', en: 'English' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/**
 * Converts Starlight's locale into a course Locale. Spanish is the root language (no prefix
 * in the URL), and Starlight represents it as `undefined`.
 */
export function toLocale(value: string | undefined): Locale {
  if (value === undefined) return defaultLocale;
  if (!isLocale(value)) {
    throw new Error(
      `[locales] Unknown language: "${value}". The valid languages are: ${locales.join(', ')}`,
    );
  }
  return value;
}
