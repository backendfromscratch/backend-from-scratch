import { describe, expect, it } from 'vitest';
import { nextTheme, storedTheme, themeFor } from './theme';

describe('nextTheme', () => {
  it('switches between dark and light', () => {
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
  });

  it('without a theme on the page, it goes to light: the default is dark', () => {
    expect(nextTheme(undefined)).toBe('light');
  });
});

describe('storedTheme', () => {
  it('reads what Starlight stores: dark, light or empty (follow the system)', () => {
    expect(storedTheme('dark')).toBe('dark');
    expect(storedTheme('light')).toBe('light');
    expect(storedTheme('')).toBeUndefined();
    expect(storedTheme(null)).toBeUndefined();
    expect(storedTheme('auto')).toBeUndefined();
  });
});

describe('themeFor', () => {
  it('the reader’s choice wins over the system', () => {
    expect(themeFor('light', false)).toBe('light');
    expect(themeFor('dark', true)).toBe('dark');
  });

  it('without a valid choice (empty, missing or anything else), the system’s', () => {
    expect(themeFor('', true)).toBe('light');
    expect(themeFor(null, false)).toBe('dark');
    expect(themeFor('auto', true)).toBe('light');
  });
});
