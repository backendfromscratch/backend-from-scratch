import { getCollection } from 'astro:content';
import { buildTranslationIndex, type TranslationIndex } from './translations';

let index: Promise<TranslationIndex> | undefined;

/** El índice de traducciones de todo el contenido. Se calcula una vez por build. */
export function getTranslationIndex(): Promise<TranslationIndex> {
  index ??= getCollection('docs').then((docs) =>
    buildTranslationIndex(
      docs.map((doc) => ({ id: doc.id, translationKey: doc.data.translationKey })),
    ),
  );
  return index;
}
