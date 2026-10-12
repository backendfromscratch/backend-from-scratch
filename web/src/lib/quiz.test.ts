import { describe, expect, it } from 'vitest';
import { quizResult, reviewLink, scoreText } from './quiz';

const backend = { href: '#por-qué', text: 'Por qué' };
const data = { href: '#datos', text: 'Datos' };

describe('quizResult', () => {
  it('counts the right answers', () => {
    const result = quizResult([
      { correct: true, review: backend },
      { correct: false, review: data },
      { correct: true, review: data },
    ]);
    expect(result).toEqual({ correct: 2, total: 3, review: [data] });
  });

  it('lists each section to review once, in the order of the questions', () => {
    const result = quizResult([
      { correct: false, review: data },
      { correct: false, review: backend },
      { correct: false, review: data },
    ]);
    expect(result.review).toEqual([data, backend]);
  });

  it('nothing to review when everything is right', () => {
    expect(quizResult([{ correct: true, review: data }]).review).toEqual([]);
  });
});

describe('scoreText', () => {
  const templates = { all: 'Las {total}, bien.', some: '{correct} de {total}.' };

  it('uses its own sentence when everything is right', () => {
    expect(scoreText({ correct: 6, total: 6 }, templates)).toBe('Las 6, bien.');
  });

  it('says how many out of how many otherwise, zero included', () => {
    expect(scoreText({ correct: 4, total: 6 }, templates)).toBe('4 de 6.');
    expect(scoreText({ correct: 0, total: 6 }, templates)).toBe('0 de 6.');
  });
});

describe('reviewLink', () => {
  const headings = [
    { slug: 'el-problema', text: 'El problema' },
    {
      slug: 'por-qué-no-puede-hacerlo-todo-el-frontend',
      text: 'Por qué no puede hacerlo todo el frontend',
    },
  ];

  it('links to the heading with that text', () => {
    expect(reviewLink('Por qué no puede hacerlo todo el frontend', headings)).toEqual({
      href: '#por-qué-no-puede-hacerlo-todo-el-frontend',
      text: 'Por qué no puede hacerlo todo el frontend',
    });
  });

  it('accepts a straight apostrophe for a typographic one', () => {
    const english = [{ slug: 'why', text: 'Why the frontend can’t do it all' }];
    expect(reviewLink("Why the frontend can't do it all", english).href).toBe('#why');
  });

  it('fails if the text is not a heading of the page', () => {
    expect(() => reviewLink('Por que no puede', headings)).toThrow(
      /«Por que no puede» is not a heading of this page/,
    );
  });
});
