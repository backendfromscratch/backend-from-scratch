import { describe, expect, it } from 'vitest';
import { formatMs, isSpeed, nextSpeed, readTime, smallResize } from './timing';

describe('readTime', () => {
  it('gives a caption 800 ms plus 240 ms per word', () => {
    expect(readTime('a b c')).toBe(1520);
  });

  it('does not count markup as words', () => {
    expect(readTime('<b>a</b> b')).toBe(1280);
  });

  it('never keeps a caption more than 5 seconds', () => {
    expect(readTime('palabra '.repeat(40))).toBe(5000);
  });
});

describe('speeds', () => {
  it('cycles normal, slow, fast', () => {
    expect(nextSpeed('normal')).toBe('slow');
    expect(nextSpeed('slow')).toBe('fast');
    expect(nextSpeed('fast')).toBe('normal');
  });

  it('recognises a stored speed', () => {
    expect(isSpeed('slow')).toBe(true);
    expect(isSpeed('ludicrous')).toBe(false);
    expect(isSpeed(null)).toBe(false);
  });
});

describe('formatMs', () => {
  it('writes milliseconds the way the lesson does', () => {
    expect(formatMs(0, 'es')).toBe('0 ms');
    expect(formatMs(0.2, 'es')).toBe('<1 ms');
    expect(formatMs(74.2, 'en')).toBe('74 ms');
  });

  it('writes seconds with each language’s decimal separator', () => {
    expect(formatMs(1072, 'es')).toBe('1,07 s');
    expect(formatMs(1072, 'en')).toBe('1.07 s');
  });
});

describe('smallResize', () => {
  it('ignores a few pixels (a late font, a scrollbar)', () => {
    expect(smallResize({ w: 600, h: 700 }, { w: 602, h: 690 })).toBe(true);
  });

  it('notices a real change', () => {
    expect(smallResize({ w: 600, h: 700 }, { w: 640, h: 700 })).toBe(false);
    expect(smallResize({ w: 600, h: 700 }, { w: 600, h: 720 })).toBe(false);
  });
});
