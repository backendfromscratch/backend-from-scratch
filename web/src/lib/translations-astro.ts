import { getCollection } from 'astro:content';
import { buildTranslationIndex, type TranslationIndex } from './translations';

let index: Promise<TranslationIndex> | undefined;

/** The translation index of all the content. Computed once per build. */
export function getTranslationIndex(): Promise<TranslationIndex> {
  index ??= getCollection('docs').then((docs) =>
    buildTranslationIndex(
      docs.map((doc) => ({ id: doc.id, translationKey: doc.data.translationKey })),
    ),
  );
  return index;
}
