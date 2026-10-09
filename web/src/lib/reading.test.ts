import { describe, expect, it } from 'vitest';
import { readingMinutes } from './reading';

const words = (n: number) => Array.from({ length: n }, () => 'palabra').join(' ');

describe('readingMinutes', () => {
  it('calcula a 200 palabras por minuto, redondeando', () => {
    expect(readingMinutes(words(2600))).toBe(13);
  });

  it('ignora los imports, las etiquetas de componentes y los bloques de código', () => {
    const body = `import Term from '~/components/Term.astro';\n\n<Term id="port">puerto</Term> ${words(200)}\n\n\`\`\`sh\n${words(400)}\n\`\`\``;
    expect(readingMinutes(body)).toBe(1);
  });

  it('no cuenta las barras de las tablas de Markdown', () => {
    // 290 palabras de verdad (270 + 20 en las celdas): 1 minuto. Con las 34 barras serían 2.
    const rows = Array.from({ length: 10 }, () => '| a | b |').join('\n');
    const body = `${words(270)}\n\n| h | h |\n|---|---|\n${rows}`;
    expect(readingMinutes(body)).toBe(1);
  });

  it('no cuenta el contenido de una prop con plantilla literal, aunque lleve «>»', () => {
    // La salida de lsof tiene «->»: no puede cortar la etiqueta y colarse como prosa.
    const body = `${words(290)}\n\n<TryIt cmd="lsof" output={\`${words(20)} 127.0.0.1:8080->127.0.0.1:49823 ${words(20)}\`}>\n\n</TryIt>`;
    expect(readingMinutes(body)).toBe(1);
  });

  it('nunca devuelve menos de 1', () => {
    expect(readingMinutes('')).toBe(1);
  });
});
