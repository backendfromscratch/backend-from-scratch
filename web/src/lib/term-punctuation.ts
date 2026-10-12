/**
 * Sätteri plugin (Astro 7's Markdown processor): keeps a glossary term together with the
 * punctuation glued to it («<Term>frontend</Term>.»). The term is a <button>, and Chromium allows
 * a line break right after a button, so the period could start the next line on its own. The term
 * and what is glued to it go inside a `.term-group` span that does not wrap (Term.astro).
 * Registered by src/integrations/markdown-plugins.ts.
 */
import { defineMdastPlugin, type MdastTarget } from 'satteri';

/** What is glued to the start of a text: everything up to the first whitespace. */
export function gluedPrefix(text: string): string {
  return /^\S+/.exec(text)?.[0] ?? '';
}

/** Markup a term can be the last thing inside: `**<Term>…</Term>**.` keeps the period too. */
const WRAPPERS = new Set(['emphasis', 'strong', 'delete']);

export const satteriTermPunctuation = defineMdastPlugin({
  name: 'term-punctuation',
  mdxJsxTextElement(node, ctx) {
    if (node.name !== 'Term') return;
    // Climbs out of the bold or italics the term ends.
    let target: Readonly<MdastTarget> = node;
    let parent = ctx.parent(target);
    while (
      parent &&
      WRAPPERS.has(parent.type) &&
      ctx.indexOf(target) === parent.children.length - 1
    ) {
      target = parent;
      parent = ctx.parent(target);
    }
    const index = ctx.indexOf(target);
    const next = index === undefined ? undefined : parent?.children[index + 1];
    if (next?.type !== 'text') return;
    const glued = gluedPrefix(next.value);
    if (!glued) return;
    ctx.setProperty(next, 'value', next.value.slice(glued.length));
    ctx.wrapNode(target, {
      type: 'mdxJsxTextElement',
      name: 'span',
      attributes: [{ type: 'mdxJsxAttribute', name: 'class', value: 'term-group' }],
      children: [{ type: 'text', value: glued }],
    });
  },
});
