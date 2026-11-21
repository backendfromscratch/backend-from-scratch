import { describe, expect, it } from 'vitest';
import { personSVG } from './people';

describe('personSVG', () => {
  const you = personSVG({ id: 'p-you', skin: 'a', hair: 'a', shirt: 'info', phone: true });

  it('names the head and the phone, so a scene can point at them', () => {
    expect(you).toContain('id="p-you"');
    expect(you).toContain('id="p-you-head"');
    expect(you).toContain('id="p-you-phone"');
  });

  it('only draws a phone or a typing arm when asked', () => {
    const plain = personSVG({ id: 'p', skin: 'b', hair: 'b', shirt: 'keyword' });
    expect(plain).not.toContain('person__phone');
    expect(plain).not.toContain('person__typing');
  });

  it('mirrors a person facing left', () => {
    expect(
      personSVG({ id: 'p', skin: 'b', hair: 'b', shirt: 'keyword', facing: 'left' }),
    ).toContain('scale(-1 1)');
    expect(you).not.toContain('scale(-1 1)');
  });

  it('takes every colour from a token, so both themes work', () => {
    expect(you).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(you).toContain('var(--ide-skin-a)');
    expect(you).toContain('var(--ide-info)');
  });

  it('is hidden from screen readers: the text says everything', () => {
    expect(you).toContain('aria-hidden="true"');
  });
});
