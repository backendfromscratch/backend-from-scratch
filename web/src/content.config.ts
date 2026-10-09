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
        // Une la página con su traducción cuando sus rutas difieren (/fase-0/que-es-dns ↔
        // /en/phase-0/what-is-dns). Es la misma en los dos idiomas. Ver src/lib/translations.ts.
        translationKey: z.string().optional(),
        // Cabecera obligatoria de cada lección (ver isLessonId y overrides/PageTitle.astro).
        lesson: z
          .object({
            oneLiner: z.string().min(1),
            objectives: z.array(z.string().min(1)).min(2).max(4),
            // Las translationKey de las lecciones que conviene leer antes (p. ej. [tcp-vs-udp]).
            prerequisites: z.array(z.string()).default([]),
          })
          .optional(),
      }),
    }),
  }),
  i18n: defineCollection({
    loader: i18nLoader(),
    schema: i18nSchema({
      // Textos de interfaz propios. Son obligatorios: si falta uno en algún idioma, el build falla.
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
    // Un fichero YAML por término e idioma: src/content/glossary/es/port.yaml → id "es/port".
    loader: glob({ pattern: '**/*.yaml', base: './src/content/glossary' }),
    schema: z.object({
      term: z.string(),
      short: z.string(),
      related: z.array(z.string()).default([]),
      // La translationKey de la lección que lo explica, si no es la primera que lo usa con <Term>
      // (p. ej. «puerto» sale antes, pero se explica en ip-ports-sockets). Ver explainingLessons.
      lesson: z.string().optional(),
    }),
  }),
};
