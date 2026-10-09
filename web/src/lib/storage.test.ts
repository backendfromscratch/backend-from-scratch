import { describe, expect, it } from 'vitest';
import { lastPageKey, safeStorage } from './storage';

describe('safeStorage', () => {
  it('guarda y lee cuando hay almacenamiento', () => {
    const data = new Map<string, string>();
    const storage = safeStorage(() => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
    }));
    storage.set('ide-outline', 'open');
    expect(storage.get('ide-outline')).toBe('open');
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
    expect(() => storage.set('ide-outline', 'open')).not.toThrow();
  });
});

describe('lastPageKey', () => {
  it('una última página por idioma: en el glosario en inglés, la última lección en inglés', () => {
    expect(lastPageKey('es')).not.toBe(lastPageKey('en'));
  });
});
