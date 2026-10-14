import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DockerLayers from './DockerLayers';
import { strings } from './strings';

describe('DockerLayers', () => {
  it('renders in Spanish with the Dockerfile, the layers and nothing built', () => {
    const html = renderToString(<DockerLayers lang="es" />);
    expect(html).toContain('laboratorio · capas de Docker');
    expect(html).toContain('COPY package.json package-lock.json .npmrc ./');
    expect(html).toContain(strings.es.files['.npmrc']);
    expect(html).toContain('RUN npm ci');
    expect(html).toContain('node:26-slim@sha256:');
    expect(html).toContain(strings.es.status.none);
    expect(html).toContain(strings.es.narration.intro);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-pagefind-ignore');
    expect(html).toContain('not-content');
  });

  it('renders in English', () => {
    const html = renderToString(<DockerLayers lang="en" />);
    expect(html).toContain('lab · Docker layers');
    expect(html).toContain(strings.en.change.src);
    expect(html).toContain(strings.en.files['.npmrc']);
    expect(html).not.toContain(strings.es.change.src);
  });
});
