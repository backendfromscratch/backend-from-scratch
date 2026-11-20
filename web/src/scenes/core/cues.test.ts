import { describe, expect, it } from 'vitest';
import { activeCue, readingLine } from './cues';

describe('activeCue', () => {
  it('is the last cue that has reached the reading line', () => {
    expect(activeCue([100, 500, 900], 400)).toBe(0);
    expect(activeCue([100, 500, 900], 520)).toBe(1);
    expect(activeCue([100, 500, 900], 2000)).toBe(2);
  });

  it('is the first one before any cue reaches the line', () => {
    expect(activeCue([600, 900], 400)).toBe(0);
  });
});

describe('readingLine', () => {
  it('is at 42% of the window on a computer', () => {
    expect(readingLine(1000, null)).toBe(420);
  });

  it('is 30% down the space under the scene on a phone', () => {
    expect(readingLine(800, 400)).toBe(520);
  });
});
