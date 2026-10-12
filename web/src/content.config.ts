import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';
import { acronymIn } from './lib/glossary';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        // Links the page to its translation when their routes differ (/fase-0/que-es-dns ↔
        // /en/phase-0/what-is-dns). It is the same in both languages. See src/lib/translations.ts.
        translationKey: z.string().optional(),
        // Required header of each lesson (see isLessonId and overrides/PageTitle.astro).
        lesson: z
          .object({
            oneLiner: z.string().min(1),
            objectives: z.array(z.string().min(1)).min(2).max(4),
            // The translationKeys of the lessons worth reading first (e.g. [tcp-vs-udp]).
            prerequisites: z.array(z.string()).default([]),
          })
          .optional(),
      }),
    }),
  }),
  i18n: defineCollection({
    loader: i18nLoader(),
    schema: i18nSchema({
      // Our own interface strings. They are required: if one is missing in any language, the build fails.
      extend: z.object({
        'reading.minutes': z.string(),
        'phase.comingSoon': z.string(),
        'term.seeGlossary': z.string(),
        'glossary.related': z.string(),
        'glossary.explainedIn': z.string(),
        'lesson.oneLiner': z.string(),
        'lesson.objectives': z.string(),
        'lesson.prerequisites': z.string(),
        'tryIt.title': z.string(),
        'tryIt.output': z.string(),
        'analogy.title': z.string(),
        'analogy.limits': z.string(),
        'selfCheck.show': z.string(),
        // The quiz at the end of a lesson; {correct} and {total} are filled in by lib/quiz.ts (scoreText).
        'quiz.check': z.string(),
        'quiz.pick': z.string(),
        'quiz.right': z.string(),
        'quiz.wrong': z.string(),
        'quiz.rightAnswer': z.string(),
        'quiz.yourAnswer': z.string(),
        'quiz.scoreAll': z.string(),
        'quiz.scoreSome': z.string(),
        'quiz.review': z.string(),
        'quiz.retry': z.string(),
        'explorer.title': z.string(),
        'explorer.comingSoon': z.string(),
        'explorer.playgrounds': z.string(),
        'explorer.glossary': z.string(),
        'explorer.resources': z.string(),
        'explorer.toggle': z.string(),
        'theme.toggle': z.string(),
        'status.lesson': z.string(),
        'status.lessonNoTotal': z.string(),
        'status.intro': z.string(),
        'pagination.label': z.string(),
        // What an acronym stands for, with {letters}, {stands} and {translation} (lib/glossary.ts, acronymParts).
        'acronym.plain': z.string(),
        'acronym.translated': z.string(),
        'lesson.prerequisiteComment': z.string(),
        'codeLens.run': z.string(),
        'phase.lessons': z.string(),
        'playgrounds.lab': z.string(),
        'playgrounds.playground': z.string(),
        'playgrounds.inLesson': z.string(),
        'footer.license': z.string(),
      }),
    }),
  }),
  glossary: defineCollection({
    // One YAML file per term and language: src/content/glossary/es/port.yaml → id "es/port".
    loader: glob({ pattern: '**/*.yaml', base: './src/content/glossary' }),
    schema: z
      .object({
        term: z.string(),
        short: z.string(),
        related: z.array(z.string()).default([]),
        // The translationKey of the lesson that explains it, if it is not the first one that uses it
        // with <Term> (e.g. «puerto» appears earlier, but is explained in ip-ports-sockets). See explainingLessons.
        lesson: z.string().optional(),
        // What the letters stand for (API → Application Programming Interface). Required when the term
        // has an acronym; `translation`, only in the languages that are not English.
        acronym: z
          .object({ letters: z.string(), stands: z.string(), translation: z.string().optional() })
          .optional(),
      })
      .refine((entry) => acronymIn(entry.term) === entry.acronym?.letters, {
        message:
          'A term with an acronym (capital letters, like «API» or «Dirección IP») needs `acronym` with those `letters`, and only then.',
      }),
  }),
};
