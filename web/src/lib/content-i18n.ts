import type esStrings from '../content/i18n/es.json';

/** Keys of the site's own interface texts (the schema requires es.json to have all of them). */
export type UiKey = keyof typeof esStrings;

/**
 * Interface text translator in the CONTENT language, not the URL language.
 *
 * On an untranslated page (/en/… showing the lesson in Spanish), the labels of the
 * components inside the content («En una frase», «Ver respuesta»…) must be in
 * Spanish, like the text around them and Starlight's buttons on that same page.
 */
export function contentT(locals: App.Locals) {
  const lng = locals.starlightRoute.entryMeta.lang;
  return (key: UiKey) => locals.t(key, { lng });
}
