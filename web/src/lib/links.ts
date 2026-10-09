import { defaultLocale, type Locale } from './locales';

/**
 * URL interna de un idioma. El español va en la raíz: localizedHref('es', 'roadmap') → '/roadmap/';
 * el inglés lleva prefijo: localizedHref('en', 'phase-0') → '/en/phase-0/'.
 */
export function localizedHref(locale: Locale, slug = ''): string {
  const cleanSlug = slug.replace(/^\/+|\/+$/g, '');
  const prefix = locale === defaultLocale ? '' : `/${locale}`;
  return cleanSlug ? `${prefix}/${cleanSlug}/` : `${prefix}/`;
}
