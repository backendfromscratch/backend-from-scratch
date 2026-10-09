// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byText, click, render, type, waitFor } from '../dom-test';
import CryptoKeys from './CryptoKeys';
import { strings } from './strings';

const t = strings.es;

beforeEach(() => {
  // The Web Crypto API only exists on secure pages: the test page is one.
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

const text = (container: HTMLElement) => container.textContent ?? '';

describe('CryptoKeys with clicks', () => {
  it('generates the keys, encrypts the message and decrypts it', async () => {
    const { container } = await render(<CryptoKeys lang="es" />);
    await click(byText(container, 'button', t.generate));
    await waitFor(() => text(container).includes('BEGIN PUBLIC KEY'));
    await click(byText(container, 'button', t.encrypt));
    await waitFor(() => text(container).includes('Mensaje cifrado ('));
    await click(byText(container, 'button', t.decrypt));
    await waitFor(() => text(container).includes(t.decrypted));
    expect(byText(container, 'pre, output, p', t.defaultMessage)).toBeTruthy();
  });

  it('while generating the keys it says so, and warns if something else is clicked', async () => {
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
    // What is announced cannot sit inside the busy area: the screen reader could silence it.
    const live = container.querySelector('[aria-live]')!;
    expect(busy()!.contains(live)).toBe(false);
    expect(live.textContent?.trim()).toBe(t.generating);
    // Another click meanwhile: it is not ignored silently.
    const other = [...container.querySelectorAll('button')].filter(
      (b) => b.textContent === t.generate,
    )[1]!;
    await click(other);
    const firstWait = live.textContent;
    expect(firstWait?.trim()).toBe(t.wait);
    // A second click, the same notice: it is announced too (the text changes unnoticeably).
    await click(other);
    expect(live.textContent?.trim()).toBe(t.wait);
    expect(live.textContent).not.toBe(firstWait);
    finish(real);
    await waitFor(() => text(container).includes('BEGIN PUBLIC KEY'));
    expect(busy()).toBeNull();
    expect(text(container)).not.toContain(t.generating);
  });

  it('when the message being signed changes, the previous signature disappears', async () => {
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

  it('if decrypting fails for something unexpected, it says so', async () => {
    const { container } = await render(<CryptoKeys lang="es" />);
    await click(byText(container, 'button', t.generate));
    await waitFor(() => text(container).includes('BEGIN PUBLIC KEY'));
    await click(byText(container, 'button', t.encrypt));
    await waitFor(() => text(container).includes('Mensaje cifrado ('));
    vi.spyOn(crypto.subtle, 'decrypt').mockRejectedValueOnce(
      new DOMException('Failure', 'OperationError'),
    );
    await click(byText(container, 'button', t.decrypt));
    await waitFor(() => text(container).includes(t.failed));
  });

  it('if generating the keys fails, it says so', async () => {
    vi.spyOn(crypto.subtle, 'generateKey').mockRejectedValueOnce(
      new DOMException('Failure', 'OperationError'),
    );
    const { container } = await render(<CryptoKeys lang="es" />);
    await click(byText(container, 'button', t.generate));
    await waitFor(() => text(container).includes(t.failed));
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
