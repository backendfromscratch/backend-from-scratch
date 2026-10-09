import { describe, expect, it } from 'vitest';
import { liveText } from './live-text';

describe('liveText', () => {
  it('dos mensajes iguales seguidos se anuncian los dos: el texto cambia sin que se note', () => {
    const first = liveText('El resolver ha devuelto un error.', 1);
    const second = liveText('El resolver ha devuelto un error.', 2);
    expect(first).not.toBe(second);
    expect(first.trim()).toBe(second.trim());
  });
});
