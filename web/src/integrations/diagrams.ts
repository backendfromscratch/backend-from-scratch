/**
 * Registra el plugin de diagramas (src/lib/diagrams/diagrams-plugin.ts) en Sätteri, el procesador
 * de Markdown de Astro 7. Va ANTES de Starlight en `integrations`, para que los bloques ```mermaid
 * ya sean HTML cuando Starlight procese el resto.
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
            '[diagrams] Se esperaba Sätteri como procesador de Markdown (el de Astro 7). Si cambia, hay que registrar el plugin de diagramas en el nuevo.',
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
