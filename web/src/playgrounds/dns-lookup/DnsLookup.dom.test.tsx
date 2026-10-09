// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byText, click, render, type, waitFor } from '../dom-test';
import DnsLookup from './DnsLookup';
import { recorded } from './fixtures';
import { strings } from './strings';

const t = strings.es;

/** fetch with the recorded responses; `blockCloudflare` simulates a corporate network that blocks it. */
function recordedFetch({ blockCloudflare = false } = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (blockCloudflare && url.hostname === 'cloudflare-dns.com') {
      throw new TypeError('Failed to fetch');
    }
    const key = `${url.searchParams.get('name')} ${url.searchParams.get('type')}`;
    if (!(key in recorded)) throw new Error(`No recorded response for «${key}»`);
    return new Response(JSON.stringify(recorded[key]), { status: 200 });
  }) as typeof fetch;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const status = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('.dns-lab__status')?.textContent ?? '';
const domainField = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>('input[type="text"]')!;

describe('DnsLookup with clicks', () => {
  it('looks up example.com, tells the path step by step and shows the records', async () => {
    vi.stubGlobal('fetch', recordedFetch());
    const { container } = await render(<DnsLookup lang="es" />);
    await click(byText(container, 'button', t.submit));
    await waitFor(() => status(container).startsWith('Respuesta: 2 registros'));
    expect(container.querySelectorAll('.dns-lab__step')).toHaveLength(1);
    await click(byText(container, 'button', t.next));
    expect(container.querySelectorAll('.dns-lab__step')).toHaveLength(2);
    await click(byText(container, 'button', t.showAll));
    expect(container.querySelector('.dns-lab__records')).not.toBeNull();
    expect(byText(container, '.dns-lab__route', 'Tu navegador').textContent).toContain(
      'Resolver 1.1.1.1',
    );
  });

  it('if Cloudflare is blocked, Google answers and the path names it', async () => {
    vi.stubGlobal('fetch', recordedFetch({ blockCloudflare: true }));
    const { container } = await render(<DnsLookup lang="es" />);
    await click(byText(container, 'button', t.submit));
    await waitFor(() => status(container).startsWith('Respuesta:'));
    expect(byText(container, '.dns-lab__route', 'Tu navegador').textContent).toContain(
      'Resolver 8.8.8.8',
    );
  });

  it('an IP is not looked up: it says it is an IP', async () => {
    vi.stubGlobal('fetch', recordedFetch());
    const { container } = await render(<DnsLookup lang="es" />);
    await type(domainField(container), '192.168.1.1');
    await click(byText(container, 'button', t.submit));
    expect(status(container).trim()).toBe(t.errors.ip);
  });

  it('two identical errors in a row are both announced (the announced text changes)', async () => {
    vi.stubGlobal('fetch', recordedFetch());
    const { container } = await render(<DnsLookup lang="es" />);
    await type(domainField(container), '');
    await click(byText(container, 'button', t.submit));
    const first = status(container);
    await click(byText(container, 'button', t.submit));
    const second = status(container);
    expect(first.trim()).toBe(t.errors.empty);
    expect(second.trim()).toBe(t.errors.empty);
    expect(second).not.toBe(first);
  });

  it('a new lookup cancels the requests of the previous one', async () => {
    const signals: AbortSignal[] = [];
    const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        if (init?.signal) signals.push(init.signal);
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Cancelada', 'AbortError')),
        );
      })) as typeof fetch;
    vi.stubGlobal('fetch', hanging);
    const { container } = await render(<DnsLookup lang="es" />);
    await click(byText(container, 'button', t.submit));
    const firstQuery = [...signals];
    expect(firstQuery.length).toBeGreaterThan(0);
    await click(byText(container, 'button', t.submit));
    expect(firstQuery.every((signal) => signal.aborted)).toBe(true);
  });
});
