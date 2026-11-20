// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { INITIAL, network } from './network';

/** The parts of Network.astro that the persistent state shows or hides. */
function stage(): HTMLElement {
  document.body.innerHTML = `
    <div class="scene-stage"><div class="scene-world" id="world">
      <span id="sc-url"></span><span id="sc-tab-title"></span><span id="sc-tab-spin" hidden></span>
      <span id="sc-lock"></span><span id="sc-key-b"></span><span id="sc-key-s"></span>
      <div id="sc-ip" hidden></div><div id="sc-cache"></div>
      <div class="sc-room__part" id="sc-srv-program"></div><div class="sc-room__part" id="sc-srv-backend"></div>
      <div id="sc-page"><div data-paint="1"></div><div data-paint="2"></div></div>
      <div data-server-sub></div><span data-server-name></span><span data-server-name></span>
    </div></div>`;
  return document.getElementById('world')!;
}

const shown = (root: HTMLElement, id: string) => !root.querySelector<HTMLElement>(id)!.hidden;
/** A part that keeps its space and only fades in (no layout shift): on when it has `is-on`. */
const on = (root: HTMLElement, id: string) => root.querySelector(id)!.classList.contains('is-on');

describe('the network world’s persistent state', () => {
  it('draws an encrypted connection to a known IP', () => {
    const root = stage();
    network.apply!(root, { ...INITIAL, url: true, ip: true, tcp: true, tls: true }, 'es');
    expect(on(root, '#sc-lock')).toBe(true);
    expect(on(root, '#sc-key-b')).toBe(true);
    expect(on(root, '#sc-key-s')).toBe(true);
    expect(shown(root, '#sc-ip')).toBe(true);
    expect(on(root, '#sc-srv-program')).toBe(false);
    expect(root.querySelector('#sc-url')!.textContent).toBe('https://example.com/');
    expect(root.querySelector('#sc-tab-title')!.textContent).toBe('example.com');
  });

  it('starts with an empty address bar and a new tab', () => {
    const root = stage();
    network.apply!(root, INITIAL, 'en');
    expect(root.querySelector('#sc-url')!.textContent).toBe('Type a URL');
    expect(root.querySelector('#sc-tab-title')!.textContent).toBe('New tab');
    expect(on(root, '#sc-lock')).toBe(false);
  });

  it('paints the page in two steps and names a far server', () => {
    const root = stage();
    network.apply!(root, { ...INITIAL, url: true, paint: 1, mode: 'far' }, 'en');
    const [html, image] = root.querySelectorAll('[data-paint]');
    expect(html!.classList.contains('is-painted')).toBe(true);
    expect(image!.classList.contains('is-painted')).toBe(false);
    for (const name of root.querySelectorAll('[data-server-name]'))
      expect(name.textContent).toBe('www.gov.za');
    expect(root.closest('.scene-stage')!.getAttribute('data-mode')).toBe('far');
  });

  it('shows the server room’s parts once the server has been opened', () => {
    const root = stage();
    network.apply!(root, { ...INITIAL, inside: true }, 'es');
    expect(on(root, '#sc-srv-program')).toBe(true);
    expect(on(root, '#sc-srv-backend')).toBe(true);
  });
});
