// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { byText, click, render } from '../dom-test';
import TcpHandshake from './TcpHandshake';
import { strings } from './strings';

const t = strings.es;

beforeEach(() => {
  document.body.innerHTML = '';
});

/** What the application has received from the server, as displayed. */
const delivered = (container: HTMLElement) =>
  container.querySelector('.tcp-lab__app dd')?.textContent ?? '';

/**
 * Advances to the end. With `lose`, loses at the first chance the data segment or datagram
 * number `lose` (counting those that carry data, in the order their «Perder» buttons appear).
 * Returns the name of the button it pressed.
 */
async function playToEnd(container: HTMLElement, lose?: number): Promise<string | undefined> {
  let lost: string | undefined;
  for (let i = 0; i < 80; i++) {
    // Only those that carry data: their name quotes the text between quotes («Hola, »).
    const loseButtons = [
      ...container.querySelectorAll<HTMLButtonElement>('button[aria-label^="Perder"]'),
    ].filter((button) => button.getAttribute('aria-label')?.includes(t.quoteOpen));
    const target = lose === undefined ? undefined : loseButtons[lose - 1];
    if (!lost && target) {
      lost = target.getAttribute('aria-label') ?? '';
      await click(target);
      continue;
    }
    const next = byText<HTMLButtonElement>(container, 'button', t.next);
    if (next.getAttribute('aria-disabled') === 'true') return lost;
    await click(next);
  }
  throw new Error('The lab did not finish in 80 steps');
}

describe('TcpHandshake with clicks', () => {
  it('without losses, the application receives the whole message', async () => {
    const { container } = await render(<TcpHandshake lang="es" />);
    await playToEnd(container);
    expect(delivered(container)).not.toBe(t.nothing);
  });

  it('TCP recovers a lost segment: the application receives the same', async () => {
    const clean = await render(<TcpHandshake lang="es" />);
    await playToEnd(clean.container);
    const whole = delivered(clean.container);
    document.body.innerHTML = '';
    const { container } = await render(<TcpHandshake lang="es" />);
    const lost = await playToEnd(container, 1);
    // What is lost carries data (it is not the SYN): otherwise data recovery would not be tested.
    expect(lost).toContain(t.quoteOpen);
    expect(delivered(container)).toBe(whole);
  });

  it('UDP does not recover a lost datagram: the application receives less', async () => {
    const clean = await render(<TcpHandshake lang="es" />);
    await playToEnd(clean.container);
    const whole = delivered(clean.container);
    document.body.innerHTML = '';
    const { container } = await render(<TcpHandshake lang="es" />);
    await click(container.querySelector<HTMLInputElement>('input[value="udp"]')!);
    const lost = await playToEnd(container, 1);
    expect(lost).toContain(t.quoteOpen);
    expect(delivered(container)).not.toBe(whole);
  });
});
