import { describe, expect, it } from 'vitest';
import { readingMinutes } from './reading';

const words = (n: number) => Array.from({ length: n }, () => 'palabra').join(' ');

describe('readingMinutes', () => {
  it('computes at 200 words per minute, rounding', () => {
    expect(readingMinutes(words(2600))).toBe(13);
  });

  it('ignores imports, component tags and code blocks', () => {
    const body = `import Term from '~/components/Term.astro';\n\n<Term id="port">puerto</Term> ${words(200)}\n\n\`\`\`sh\n${words(400)}\n\`\`\``;
    expect(readingMinutes(body)).toBe(1);
  });

  it('does not count the pipes of Markdown tables', () => {
    // 290 real words (270 + 20 in the cells): 1 minute. With the 34 pipes it would be 2.
    const rows = Array.from({ length: 10 }, () => '| a | b |').join('\n');
    const body = `${words(270)}\n\n| h | h |\n|---|---|\n${rows}`;
    expect(readingMinutes(body)).toBe(1);
  });

  it('does not count the content of a prop with a template literal, even if it contains «>»', () => {
    // The lsof output has «->»: it must not cut the tag short and leak in as prose.
    const body = `${words(290)}\n\n<TryIt cmd="lsof" output={\`${words(20)} 127.0.0.1:8080->127.0.0.1:49823 ${words(20)}\`}>\n\n</TryIt>`;
    expect(readingMinutes(body)).toBe(1);
  });

  it('never returns less than 1', () => {
    expect(readingMinutes('')).toBe(1);
  });
});
