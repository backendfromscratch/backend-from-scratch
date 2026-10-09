import { describe, expect, it } from 'vitest';
import { liveText } from './live-text';

describe('liveText', () => {
  it('two identical messages in a row are both announced: the text changes without being noticeable', () => {
    const first = liveText('El resolver ha devuelto un error.', 1);
    const second = liveText('El resolver ha devuelto un error.', 2);
    expect(first).not.toBe(second);
    expect(first.trim()).toBe(second.trim());
  });
});
