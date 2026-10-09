import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

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
        'explorer.title': z.string(),
        'explorer.comingSoon': z.string(),
        'tabs.pinned': z.string(),
        'tabs.playgrounds': z.string(),
        'tabs.glossary': z.string(),
        'breadcrumbs.label': z.string(),
        'status.lesson': z.string(),
        'status.lessonNoTotal': z.string(),
        'status.intro': z.string(),
        'pagination.label': z.string(),
        'term.kind': z.string(),
        'lesson.prerequisiteComment': z.string(),
        'codeLens.run': z.string(),
        'phase.lessons': z.string(),
        'playgrounds.lab': z.string(),
        'playgrounds.playground': z.string(),
        'playgrounds.inLesson': z.string(),
      }),
    }),
  }),
  glossary: defineCollection({
    // One YAML file per term and language: src/content/glossary/es/port.yaml → id "es/port".
    loader: glob({ pattern: '**/*.yaml', base: './src/content/glossary' }),
    schema: z.object({
      term: z.string(),
      short: z.string(),
      related: z.array(z.string()).default([]),
      // The translationKey of the lesson that explains it, if it is not the first one that uses it
      // with <Term> (e.g. «puerto» appears earlier, but is explained in ip-ports-sockets). See explainingLessons.
      lesson: z.string().optional(),
    }),
  }),
};
