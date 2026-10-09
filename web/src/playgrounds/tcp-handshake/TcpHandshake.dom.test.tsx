// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { byText, click, render } from '../dom-test';
import TcpHandshake from './TcpHandshake';
import { strings } from './strings';

const t = strings.es;

beforeEach(() => {
  document.body.innerHTML = '';
});

/** Lo que ha recibido la aplicación del servidor, tal como se ve. */
const delivered = (container: HTMLElement) =>
  container.querySelector('.tcp-lab__app dd')?.textContent ?? '';

/**
 * Avanza hasta el final. Con `lose`, pierde la primera vez que pueda el segmento o datagrama de datos
 * número `lose` (contando los que llevan datos, en el orden en que aparecen sus botones «Perder»).
 * Devuelve el nombre del botón que ha pulsado.
 */
async function playToEnd(container: HTMLElement, lose?: number): Promise<string | undefined> {
  let lost: string | undefined;
  for (let i = 0; i < 80; i++) {
    // Solo los que llevan datos: su nombre cita el texto entre comillas («Hola, »).
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
  throw new Error('El laboratorio no ha terminado en 80 pasos');
}

describe('TcpHandshake con clics', () => {
  it('sin pérdidas, la aplicación recibe el mensaje entero', async () => {
    const { container } = await render(<TcpHandshake lang="es" />);
    await playToEnd(container);
    expect(delivered(container)).not.toBe(t.nothing);
  });

  it('TCP recupera un segmento perdido: la aplicación recibe lo mismo', async () => {
    const clean = await render(<TcpHandshake lang="es" />);
    await playToEnd(clean.container);
    const whole = delivered(clean.container);
    document.body.innerHTML = '';
    const { container } = await render(<TcpHandshake lang="es" />);
    const lost = await playToEnd(container, 1);
    // Lo perdido lleva datos (no es el SYN): si no, no se pondría a prueba la recuperación de datos.
    expect(lost).toContain(t.quoteOpen);
    expect(delivered(container)).toBe(whole);
  });

  it('UDP no recupera un datagrama perdido: la aplicación recibe menos', async () => {
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
