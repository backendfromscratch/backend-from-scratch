/**
 * Registers our plugins in Sätteri, Astro 7's Markdown processor: the diagrams
 * (src/lib/diagrams/diagrams-plugin.ts) and the punctuation glued to a glossary term
 * (src/lib/term-punctuation.ts). It goes BEFORE Starlight in `integrations`, so the ```mermaid
 * blocks are already HTML when Starlight processes the rest.
 */
import type { AstroIntegration } from 'astro';
import { isSatteriProcessor, satteri } from '@astrojs/markdown-satteri';
import { satteriDiagrams } from '../lib/diagrams/diagrams-plugin';
import { satteriTermPunctuation } from '../lib/term-punctuation';

export function markdownPlugins(): AstroIntegration {
  return {
    name: 'markdown-plugins',
    hooks: {
      'astro:config:setup': ({ config, updateConfig }) => {
        const processor = config.markdown.processor;
        if (!processor || !isSatteriProcessor(processor)) {
          throw new Error(
            "[markdown-plugins] Expected Sätteri as the Markdown processor (Astro 7's). If it changes, our plugins must be registered in the new one.",
          );
        }
        const options = processor.options;
        updateConfig({
          markdown: {
            processor: satteri({
              ...options,
              mdastPlugins: [...options.mdastPlugins, satteriDiagrams(), satteriTermPunctuation],
            }),
          },
        });
      },
    },
  };
}
