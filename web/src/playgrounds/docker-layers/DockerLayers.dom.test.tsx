// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { byText, click, render } from '../dom-test';
import DockerLayers from './DockerLayers';
import { strings } from './strings';

const t = strings.es;

beforeEach(() => {
  document.body.innerHTML = '';
});

/** The mark of the layer whose instruction is `text` (in the stage `stage`, if given). */
function mark(container: HTMLElement, text: string, nth = 0): string {
  const layers = [...container.querySelectorAll<HTMLElement>('.docker-lab__layer')].filter(
    (layer) => layer.querySelector('code')?.textContent === text,
  );
  return layers[nth]?.querySelector('.docker-lab__mark')?.textContent ?? '';
}

const live = (container: HTMLElement) =>
  container.querySelector('[aria-live="polite"]')?.textContent ?? '';
const total = (container: HTMLElement, term: string) =>
  [...container.querySelectorAll('.docker-lab__totals > div')]
    .find((row) => row.querySelector('dt')?.textContent === term)
    ?.querySelector('dd')?.textContent ?? '';
const button = (container: HTMLElement, text: string) =>
  byText<HTMLButtonElement>(container, 'button', text);
const radio = (container: HTMLElement, value: string) =>
  container.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;

describe('DockerLayers with clicks', () => {
  it('builds, changes a file of src/ and rebuilds: only COPY . . runs again', async () => {
    const { container } = await render(<DockerLayers lang="es" />);
    expect(total(container, t.buildTime)).toBe(t.notBuilt);
    await click(button(container, t.build));
    expect(mark(container, 'RUN npm ci')).toContain(t.status.rebuilt);
    expect(total(container, t.buildTime)).toMatch(/\d,\d s/);
    expect(live(container)).toContain('Primera construcción');

    await click(button(container, t.change.src));
    expect(total(container, t.pending)).toBe('src/');
    expect(live(container)).toContain('«Reconstruir»');

    await click(button(container, t.rebuild));
    expect(mark(container, 'RUN npm ci')).toContain(t.status.cached);
    expect(mark(container, 'COPY package.json package-lock.json .npmrc ./')).toContain(
      t.status.cached,
    );
    expect(mark(container, 'COPY . .')).toContain(t.status.rebuilt);
    expect(total(container, t.pending)).toBe(t.none);
    expect(live(container)).toContain('Solo se reconstruye «COPY . .»');
    expect(total(container, t.buildTime)).toContain('pasos ejecutados: 1;');
  });

  it('a change in package.json runs npm ci again', async () => {
    const { container } = await render(<DockerLayers lang="es" />);
    await click(button(container, t.build));
    await click(button(container, t.change['package.json']));
    await click(button(container, t.rebuild));
    expect(mark(container, 'WORKDIR /app')).toContain(t.status.cached);
    expect(mark(container, 'COPY package.json package-lock.json .npmrc ./')).toContain(
      t.status.rebuilt,
    );
    expect(mark(container, 'RUN npm ci')).toContain(t.status.rebuilt);
  });

  it('the wrong order: a change in src/ runs npm ci again too', async () => {
    const { container } = await render(<DockerLayers lang="es" />);
    await click(radio(container, 'wrong'));
    const lines = [...container.querySelectorAll('.docker-lab__file code')].map(
      (code) => code.textContent,
    );
    expect(lines.slice(1, 4)).toEqual(['WORKDIR /app', 'COPY . .', 'RUN npm ci']);
    expect(live(container)).toContain('Orden incorrecto');
    await click(button(container, t.build));
    await click(button(container, t.change.src));
    await click(button(container, t.rebuild));
    expect(mark(container, 'RUN npm ci')).toContain(t.status.rebuilt);
    expect(live(container)).toContain('El paso más lento es «RUN npm ci»');
  });

  it('multi-stage: the build stages stay out of the image, which is smaller', async () => {
    const { container } = await render(<DockerLayers lang="es" />);
    const single = total(container, t.imageSize);
    await click(radio(container, 'on'));
    expect(container.querySelectorAll('.docker-lab__stage')).toHaveLength(3);
    expect(container.textContent).toContain(t.stageBuild);
    expect(total(container, t.leftOut)).toMatch(/MB/);
    expect(parseFloat(total(container, t.imageSize).replace(',', '.'))).toBeLessThan(
      parseFloat(single.replace(',', '.')),
    );
    // The order switch is off: multi-stage always uses the right order.
    expect(radio(container, 'wrong').closest('fieldset')?.disabled).toBe(true);
    expect(container.textContent).toContain(t.orderFixed);

    await click(button(container, t.build));
    await click(button(container, t.change.src));
    await click(button(container, t.rebuild));
    expect(mark(container, 'RUN npm ci --omit=dev && npm cache clean --force')).toContain(
      t.status.cached,
    );
    expect(mark(container, 'COPY --from=comprobar /app/src ./src')).toContain(t.status.rebuilt);
    expect(live(container)).toContain('(etapa comprobar)');
  });

  it('a repeated sentence is still announced: the text alternates', async () => {
    const { container } = await render(<DockerLayers lang="es" />);
    await click(button(container, t.build));
    await click(button(container, t.rebuild));
    const once = live(container);
    await click(button(container, t.rebuild));
    expect(live(container)).not.toBe(once);
    expect(live(container).trim()).toBe(once.trim());
  });

  it('works in English', async () => {
    const { container } = await render(<DockerLayers lang="en" />);
    await click(button(container, strings.en.build));
    await click(button(container, strings.en.change.src));
    await click(button(container, strings.en.rebuild));
    expect(mark(container, 'COPY . .')).toContain(strings.en.status.rebuilt);
    expect(live(container)).toContain('Only “COPY . .” is rebuilt');
  });
});
