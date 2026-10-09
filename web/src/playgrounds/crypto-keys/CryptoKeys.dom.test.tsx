// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byText, click, render, type, waitFor } from '../dom-test';
import CryptoKeys from './CryptoKeys';
import { strings } from './strings';

const t = strings.es;

beforeEach(() => {
  // La Web Crypto API solo existe en páginas seguras: la del test lo es.
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

const text = (container: HTMLElement) => container.textContent ?? '';

describe('CryptoKeys con clics', () => {
  it('genera las claves, cifra el mensaje y lo descifra', async () => {
    const { container } = await render(<CryptoKeys lang="es" />);
    await click(byText(container, 'button', t.generate));
    await waitFor(() => text(container).includes('BEGIN PUBLIC KEY'));
    await click(byText(container, 'button', t.encrypt));
    await waitFor(() => text(container).includes('Mensaje cifrado ('));
    await click(byText(container, 'button', t.decrypt));
    await waitFor(() => text(container).includes(t.decrypted));
    expect(byText(container, 'pre, output, p', t.defaultMessage)).toBeTruthy();
  });

  it('mientras genera las claves lo dice, y avisa si se pulsa otra cosa', async () => {
    let finish: (pair: CryptoKeyPair) => void = () => {};
    const real = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    );
    vi.spyOn(crypto.subtle, 'generateKey').mockImplementation(
      () => new Promise((resolve) => (finish = resolve as (pair: CryptoKeyPair) => void)),
    );
    const { container } = await render(<CryptoKeys lang="es" />);
    await click(byText(container, 'button', t.generate));
    const busy = () => container.querySelector('[aria-busy="true"]');
    expect(busy()).not.toBeNull();
    expect(text(container)).toContain(t.generating);
    // Lo que se anuncia no puede quedar dentro de la zona ocupada: el lector de pantalla podría callarlo.
    const live = container.querySelector('[aria-live]')!;
    expect(busy()!.contains(live)).toBe(false);
    expect(live.textContent?.trim()).toBe(t.generating);
    // Otro clic mientras tanto: no se ignora en silencio.
    const other = [...container.querySelectorAll('button')].filter(
      (b) => b.textContent === t.generate,
    )[1]!;
    await click(other);
    const firstWait = live.textContent;
    expect(firstWait?.trim()).toBe(t.wait);
    // Un segundo clic, el mismo aviso: también se anuncia (el texto cambia sin que se note).
    await click(other);
    expect(live.textContent?.trim()).toBe(t.wait);
    expect(live.textContent).not.toBe(firstWait);
    finish(real);
    await waitFor(() => text(container).includes('BEGIN PUBLIC KEY'));
    expect(busy()).toBeNull();
    expect(text(container)).not.toContain(t.generating);
  });

  it('al cambiar el mensaje que se firma, la firma anterior desaparece', async () => {
    const { container } = await render(<CryptoKeys lang="es" />);
    const signButtons = () =>
      [...container.querySelectorAll('button')].filter((b) => b.textContent === t.generate);
    await click(signButtons()[1]!);
    await waitFor(() => !!container.querySelector('button') && text(container).includes(t.sign));
    await waitFor(() => {
      try {
        byText(container, 'button', t.sign);
        return text(container).match(/BEGIN PUBLIC KEY/g)?.length === 1;
      } catch {
        return false;
      }
    });
    await click(byText(container, 'button', t.sign));
    await waitFor(() => text(container).includes('Firma ('));
    const field = byText(container, 'label', t.toSign).querySelector('textarea')!;
    await type(field, 'Transfiere 1000 € a Ana');
    expect(text(container)).not.toContain('Firma (');
  });

  it('si descifrar falla por algo inesperado, lo dice', async () => {
    const { container } = await render(<CryptoKeys lang="es" />);
    await click(byText(container, 'button', t.generate));
    await waitFor(() => text(container).includes('BEGIN PUBLIC KEY'));
    await click(byText(container, 'button', t.encrypt));
    await waitFor(() => text(container).includes('Mensaje cifrado ('));
    vi.spyOn(crypto.subtle, 'decrypt').mockRejectedValueOnce(
      new DOMException('Fallo', 'OperationError'),
    );
    await click(byText(container, 'button', t.decrypt));
    await waitFor(() => text(container).includes(t.failed));
  });

  it('si generar las claves falla, lo dice', async () => {
    vi.spyOn(crypto.subtle, 'generateKey').mockRejectedValueOnce(
      new DOMException('Fallo', 'OperationError'),
    );
    const { container } = await render(<CryptoKeys lang="es" />);
    await click(byText(container, 'button', t.generate));
    await waitFor(() => text(container).includes(t.failed));
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
