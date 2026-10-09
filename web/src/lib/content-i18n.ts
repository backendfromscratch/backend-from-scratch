import type esStrings from '../content/i18n/es.json';

/** Claves de los textos de interfaz propios (el esquema obliga a que es.json las tenga todas). */
export type UiKey = keyof typeof esStrings;

/**
 * Traductor de textos de interfaz en el idioma del CONTENIDO, no en el de la URL.
 *
 * En una página sin traducir (/en/… mostrando la lección en español), las etiquetas de los
 * componentes que van dentro del contenido («En una frase», «Ver respuesta»…) deben ir en
 * español, igual que el texto que las rodea y que los botones de Starlight en esa misma página.
 */
export function contentT(locals: App.Locals) {
  const lng = locals.starlightRoute.entryMeta.lang;
  return (key: UiKey) => locals.t(key, { lng });
}
