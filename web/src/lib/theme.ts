/**
 * The theme button (components/overrides/ThemeSelect.astro). It keeps Starlight's storage, so its
 * script in the <head> (ThemeProvider) paints the right theme before the page shows: «dark» or
 * «light» if the reader chose one; empty to follow the system, which is how everyone starts.
 */

export type Theme = 'dark' | 'light';

/** Key in localStorage, the same one Starlight uses. */
export const THEME_KEY = 'starlight-theme';

/** The theme the reader chose, or undefined if they follow the system. */
export function storedTheme(value: string | null): Theme | undefined {
  return value === 'dark' || value === 'light' ? value : undefined;
}

/** The theme a click switches to. Without one on the page, the current one is dark (Starlight's default). */
export function nextTheme(current: string | undefined): Theme {
  return current === 'light' ? 'dark' : 'light';
}
