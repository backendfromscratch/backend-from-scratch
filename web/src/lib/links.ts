import { defaultLocale, type Locale } from './locales';

/**
 * Internal URL for a language. Spanish goes at the root: localizedHref('es', 'roadmap') → '/roadmap/';
 * English gets a prefix: localizedHref('en', 'phase-0') → '/en/phase-0/'.
 */
export function localizedHref(locale: Locale, slug = ''): string {
  const cleanSlug = slug.replace(/^\/+|\/+$/g, '');
  const prefix = locale === defaultLocale ? '' : `/${locale}`;
  return cleanSlug ? `${prefix}/${cleanSlug}/` : `${prefix}/`;
}
