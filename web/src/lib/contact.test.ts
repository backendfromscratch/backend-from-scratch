import { describe, expect, it } from 'vitest';
import { lessonIssueUrl } from './contact';

const repo = 'https://github.com/backendfromscratch/backend-from-scratch';

describe('lessonIssueUrl', () => {
  it('opens the lesson form in the reader’s language, with the lesson filled in', () => {
    const url = new URL(
      lessonIssueUrl(repo, 'es', {
        title: 'Qué es el DNS y cómo funciona',
        url: 'https://backenddesdecero.com/fase-0/que-es-dns/',
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(`${repo}/issues/new`);
    expect(url.searchParams.get('template')).toBe('leccion.yml');
    expect(url.searchParams.get('title')).toBe('[Qué es el DNS y cómo funciona] ');
    expect(url.searchParams.get('lesson')).toBe('https://backenddesdecero.com/fase-0/que-es-dns/');
  });

  it('uses the English form for an English lesson', () => {
    const url = new URL(
      lessonIssueUrl(repo, 'en', {
        title: 'What is DNS',
        url: 'https://x/en/phase-0/what-is-dns/',
      }),
    );
    expect(url.searchParams.get('template')).toBe('lesson.yml');
  });

  it('escapes what would break the address (& and # in a title)', () => {
    const url = new URL(lessonIssueUrl(repo, 'en', { title: 'HTTP & #1', url: 'https://x/' }));
    expect(url.searchParams.get('title')).toBe('[HTTP & #1] ');
    expect(url.hash).toBe('');
  });
});
