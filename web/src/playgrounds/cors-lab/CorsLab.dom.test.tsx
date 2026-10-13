// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { byText, click, render } from '../dom-test';
import CorsLab from './CorsLab';
import { strings } from './strings';

const t = strings.es;

beforeEach(() => {
  document.body.innerHTML = '';
});

/** Chooses an option in a select the way the reader would: React only notices the change event. */
async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const scenarioSelect = (container: HTMLElement) =>
  container.querySelector<HTMLSelectElement>('.cors-lab__scenario select')!;
const rows = (container: HTMLElement) => container.querySelectorAll('.cors-lab__row').length;
const answers = (container: HTMLElement) =>
  [...container.querySelectorAll('.cors-lab__outcome dd')].map((dd) => dd.textContent);
const consoleText = (container: HTMLElement) =>
  container.querySelector('.cors-lab__console')?.textContent ?? '';

describe('CorsLab with clicks', () => {
  it('steps one by one to the end of the usual error, and then stops', async () => {
    const { container } = await render(<CorsLab lang="es" />);
    expect(rows(container)).toBe(1);
    expect(answers(container)).toEqual([t.pending, t.pending, t.pending]);
    const next = byText<HTMLButtonElement>(container, 'button', t.next);
    for (let i = 0; i < 10; i++) await click(next);
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(rows(container)).toBe(7);
    expect(answers(container)).toEqual(['✓ Sí', '✕ No', '✕ No']);
    expect(consoleText(container)).toContain(
      "No 'Access-Control-Allow-Origin' header is present on the requested resource.",
    );
    expect(consoleText(container)).toContain('TypeError: Failed to fetch');
  });

  it('a POST with JSON: the real request is not sent, and the server never sees it', async () => {
    const { container } = await render(<CorsLab lang="es" />);
    await choose(scenarioSelect(container), 'post-json');
    await click(byText(container, 'button', t.all));
    expect(container.querySelector('.cors-lab__row--not-sent')?.textContent).toContain(t.notSent);
    expect(container.querySelector('.cors-lab__row--server-acts')).toBeNull();
    expect(answers(container)).toEqual(['✕ No', '✕ No', '✕ No']);
    expect(consoleText(container)).toContain('It does not have HTTP ok status.');
  });

  it('the approved preflight: the page reads the orders', async () => {
    const { container } = await render(<CorsLab lang="es" />);
    await choose(scenarioSelect(container), 'preflight-approved');
    await click(byText(container, 'button', t.all));
    expect(answers(container)).toEqual(['✓ Sí', '✕ No', '✓ Sí']);
    expect(container.querySelector('.cors-lab__console')).toBeNull();
    expect(container.querySelector('[aria-live]')?.textContent).toContain(t.responseBody);
  });

  it('changing a control makes it custom and starts again from the first step', async () => {
    const { container } = await render(<CorsLab lang="es" />);
    await click(byText(container, 'button', t.all));
    const method = container.querySelector<HTMLSelectElement>('.cors-lab__fields select')!;
    await choose(method, 'PUT');
    expect(scenarioSelect(container).value).toBe('custom');
    expect(rows(container)).toBe(1);
    await click(byText(container, 'button', t.all));
    expect(container.textContent).toContain('OPTIONS /pedidos');
  });

  it('a control of the server changes the run', async () => {
    const { container } = await render(<CorsLab lang="es" />);
    await choose(scenarioSelect(container), 'cookies-wildcard');
    await click(byText(container, 'button', t.all));
    expect(answers(container)).toEqual(['✓ Sí', '✓ Sí', '✕ No']);
    const origin = [
      ...container.querySelectorAll<HTMLSelectElement>('.cors-lab__fields select'),
    ].find((select) => select.querySelector('option[value="page"]'))!;
    await choose(origin, 'page');
    await click(byText(container, 'button', t.all));
    expect(answers(container)).toEqual(['✓ Sí', '✓ Sí', '✓ Sí']);
  });
});
