import { fill } from './fill';

/** A heading of the lesson to review, as the quiz links to it. */
export interface ReviewLink {
  href: string;
  text: string;
}

/** How a question was answered, and the section that explains it. */
export interface Answer {
  correct: boolean;
  review: ReviewLink;
}

export interface QuizResult {
  correct: number;
  total: number;
  /** The sections of the questions that were wrong, once each and in the lesson's order of the questions. */
  review: ReviewLink[];
}

/** The result of a finished quiz. */
export function quizResult(answers: readonly Answer[]): QuizResult {
  const review = new Map<string, ReviewLink>();
  for (const answer of answers) {
    if (!answer.correct && !review.has(answer.review.href)) {
      review.set(answer.review.href, answer.review);
    }
  }
  return {
    correct: answers.filter((answer) => answer.correct).length,
    total: answers.length,
    review: [...review.values()],
  };
}

/** The score sentence: one template when everything is right and another otherwise. */
export function scoreText(
  result: Pick<QuizResult, 'correct' | 'total'>,
  templates: { all: string; some: string },
): string {
  const template = result.correct === result.total ? templates.all : templates.some;
  return fill(template, { correct: result.correct, total: result.total });
}

/**
 * The heading a question sends the reader back to, looked up by its text among the page's
 * headings. A text that is not a heading of the page is an error: the build fails.
 */
export function reviewLink(
  text: string,
  headings: readonly { slug: string; text: string }[],
): ReviewLink {
  // The Markdown turns ' and " into typographic quotes in the headings: either one is accepted.
  const plain = (value: string) => value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const heading = headings.find((candidate) => plain(candidate.text) === plain(text));
  if (!heading) {
    throw new Error(
      `[Quiz] «${text}» is not a heading of this page. Headings: ${headings.map((h) => `«${h.text}»`).join(', ')}`,
    );
  }
  return { href: `#${heading.slug}`, text: heading.text };
}
