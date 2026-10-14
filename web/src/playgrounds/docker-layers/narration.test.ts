import { describe, expect, it } from 'vitest';
import { describeFiles, formatBytes, formatSeconds, narrate, quote } from './narration';
import { initialState, reduce, type Action } from './lab-state';
import { scenarios } from './scenarios';
import { strings } from './strings';

const es = strings.es;
const en = strings.en;

describe('formats', () => {
  it('sizes and seconds in each language', () => {
    expect(formatBytes(es, 'es', 157_212_672)).toBe('157,2 MB');
    expect(formatBytes(en, 'en', 157_212_672)).toBe('157.2 MB');
    expect(formatSeconds(es, 'es', 4)).toBe('4,0 s');
    expect(formatSeconds(en, 'en', 0.1)).toBe('0.1 s');
  });

  it('what a COPY takes', () => {
    expect(describeFiles(es, 'es', ['package.json', 'package-lock.json'])).toBe(
      'package.json y package-lock.json',
    );
    expect(describeFiles(es, 'es', scenarios.good.instructions[2]!.files)).toBe(
      'package.json, package-lock.json y .npmrc (la configuración de npm)',
    );
    expect(
      describeFiles(en, 'en', ['src', 'package.json', 'package-lock.json', '.npmrc', 'other']),
    ).toBe(en.everything);
  });

  it('an instruction is quoted with its stage only with several stages', () => {
    expect(quote(es, scenarios.good.instructions[3]!)).toBe('«RUN npm ci»');
    const check = scenarios.multi.instructions.find((i) => i.text === 'RUN npm run check')!;
    expect(quote(es, check)).toBe('«RUN npm run check» (etapa comprobar)');
  });
});

describe('narrate', () => {
  const play = (...actions: Action[]) => actions.reduce(reduce, initialState());

  it('the sentence of a rebuild names the first step rebuilt and the slowest', () => {
    const state = play(
      { type: 'order', order: 'wrong' },
      { type: 'build' },
      { type: 'change', change: 'src' },
      { type: 'build' },
    );
    const sentence = narrate(es, 'es', state.narration, scenarios.wrong.instructions, es.rebuild);
    expect(sentence).toContain('a partir de «COPY . .»');
    expect(sentence).toContain('El paso más lento es «RUN npm ci»');
  });

  it('a change names the button to press now', () => {
    const before = play({ type: 'change', change: 'package.json' });
    expect(narrate(en, 'en', before.narration, scenarios.good.instructions, en.build)).toContain(
      '“Build”',
    );
  });

  it('every narration has a sentence in both languages', () => {
    const states = [
      play(),
      play({ type: 'multi-stage', on: true }),
      play({ type: 'change', change: 'src' }),
      play({ type: 'build' }),
      play({ type: 'build' }, { type: 'build' }),
      play({ type: 'build' }, { type: 'change', change: 'src' }, { type: 'build' }),
      play({ type: 'build' }, { type: 'change', change: 'package.json' }, { type: 'build' }),
    ];
    for (const lang of ['es', 'en'] as const) {
      for (const state of states) {
        const sentence = narrate(
          strings[lang],
          lang,
          state.narration,
          scenarios.good.instructions,
          'x',
        );
        expect(sentence).not.toMatch(/\{\w+\}/);
        expect(sentence.length).toBeGreaterThan(20);
      }
    }
  });
});
