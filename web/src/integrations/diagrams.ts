/**
 * Registers the diagrams plugin (src/lib/diagrams/diagrams-plugin.ts) in Sätteri, Astro 7's
 * Markdown processor. It goes BEFORE Starlight in `integrations`, so the ```mermaid blocks are
 * already HTML when Starlight processes the rest.
 */
import type { AstroIntegration } from 'astro';
import { isSatteriProcessor, satteri } from '@astrojs/markdown-satteri';
import { satteriDiagrams } from '../lib/diagrams/diagrams-plugin';

export function diagrams(): AstroIntegration {
  return {
    name: 'diagrams',
    hooks: {
      'astro:config:setup': ({ config, updateConfig }) => {
        const processor = config.markdown.processor;
        if (!processor || !isSatteriProcessor(processor)) {
          throw new Error(
            "[diagrams] Expected Sätteri as the Markdown processor (Astro 7's). If it changes, the diagrams plugin must be registered in the new one.",
          );
        }
        const options = processor.options;
        updateConfig({
          markdown: {
            processor: satteri({
              ...options,
              mdastPlugins: [...options.mdastPlugins, satteriDiagrams()],
            }),
          },
        });
      },
    },
  };
}
