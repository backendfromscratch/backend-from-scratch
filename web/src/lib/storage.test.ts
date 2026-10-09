import { describe, expect, it } from 'vitest';
import { lastPageKey, safeStorage } from './storage';

describe('safeStorage', () => {
  it('saves and reads when storage is available', () => {
    const data = new Map<string, string>();
    const storage = safeStorage(() => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
    }));
    storage.set('ide-outline', 'open');
    expect(storage.get('ide-outline')).toBe('open');
  });

  it('without localStorage (private browsing) it does not throw: reads null and does not save', () => {
    const storage = safeStorage(() => {
      throw new DOMException('Acceso denegado', 'SecurityError');
    });
    expect(storage.get('starlight-theme')).toBeNull();
    expect(() => storage.set('starlight-theme', 'dark')).not.toThrow();
  });

  it('if saving fails (quota full), it does not throw', () => {
    const storage = safeStorage(() => ({
      getItem: () => null,
      setItem: () => {
        throw new DOMException('Sin espacio', 'QuotaExceededError');
      },
    }));
    expect(() => storage.set('ide-outline', 'open')).not.toThrow();
  });
});

describe('lastPageKey', () => {
  it('one last page per language: in the English glossary, the last English lesson', () => {
    expect(lastPageKey('es')).not.toBe(lastPageKey('en'));
  });
});
