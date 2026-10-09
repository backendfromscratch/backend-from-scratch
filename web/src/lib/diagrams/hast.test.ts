import { describe, expect, it } from 'vitest';
import { el, lines, text, toHtml } from './hast';

describe('toHtml', () => {
  it('escribe elementos, clases y atributos aria', () => {
    const node = el('ol', { className: ['seq__participants'], ariaHidden: 'true' }, [
      el('li', { className: ['a', 'b'] }, [text('Navegador')]),
    ]);
    expect(toHtml(node)).toBe(
      '<ol class="seq__participants" aria-hidden="true"><li class="a b">Navegador</li></ol>',
    );
  });

  it('escapa el texto y los atributos', () => {
    expect(toHtml(el('span', { title: 'a "b" & <c>' }, [text('GET / <h1> & «x»')]))).toBe(
      '<span title="a &quot;b&quot; &amp; &lt;c>">GET / &lt;h1> &amp; «x»</span>',
    );
  });

  it('<br> no tiene cierre', () => {
    expect(toHtml(el('span', {}, lines(['uno', 'dos'])))).toBe('<span>uno<br>dos</span>');
  });
});
