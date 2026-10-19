import type { Locale } from './locales';

/** The issue form for a lesson in each language (.github/ISSUE_TEMPLATE/). */
const lessonIssueTemplate: Record<Locale, string> = {
  es: 'leccion.yml',
  en: 'lesson.yml',
};

/**
 * The link to report a problem with a lesson: a new issue with its form already chosen, the title
 * saying which lesson it is and the form's «lesson» field holding its address. GitHub fills a form
 * field from the query parameter with the field's id.
 */
export function lessonIssueUrl(
  repoUrl: string,
  locale: Locale,
  lesson: { title: string; url: string },
): string {
  const query = new URLSearchParams({
    template: lessonIssueTemplate[locale],
    title: `[${lesson.title}] `,
    lesson: lesson.url,
  });
  return `${repoUrl}/issues/new?${query}`;
}
