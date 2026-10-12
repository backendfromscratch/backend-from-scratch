import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The practice material of Phase 2, «HTTP a fondo» (spec docs/specs/2026-10-12-phase-2-design.md, §5):
// two files the course's own site serves with and without CORS, and the nginx configuration of
// Ana and Luis's shop for the practice VM, in Spanish and English. They were checked with nginx
// 1.24.0 on Ubuntu 24.04 when written; these tests keep them from drifting apart.

const read = (path: string) =>
  readFileSync(new URL(`../../../public/${path}`, import.meta.url), 'utf8');

/** The rules of Cloudflare's _headers file: a path pattern and the headers it adds. */
function headerRules(text: string) {
  const rules: { pattern: RegExp; headers: Record<string, string> }[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      // Every character is literal except «*», Cloudflare's wildcard.
      const literal = line.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`^${literal.replace(/\\\*/g, '.*')}$`);
      rules.push({ pattern, headers: {} });
    } else {
      const [name, ...value] = line.trim().split(':');
      rules.at(-1)!.headers[name!.toLowerCase()] = value.join(':').trim();
    }
  }
  return rules;
}

/** Every header a path gets: Cloudflare combines all the rules that match it. */
function headersFor(path: string) {
  return Object.assign(
    {},
    ...headerRules(read('_headers'))
      .filter((rule) => rule.pattern.test(path))
      .map((rule) => rule.headers),
  ) as Record<string, string>;
}

describe('the CORS practice files (lesson 6)', () => {
  it('lets any origin read cors-on.json', () => {
    expect(headersFor('/practicas/http/cors-on.json')['access-control-allow-origin']).toBe('*');
  });

  it('gives cors-off.json no CORS header at all', () => {
    expect(headersFor('/practicas/http/cors-off.json')).not.toHaveProperty(
      'access-control-allow-origin',
    );
  });

  it('serves both as valid JSON, kept out of search engines like the rest of /practicas/', () => {
    for (const file of ['cors-on.json', 'cors-off.json']) {
      expect(() => JSON.parse(read(`practicas/http/${file}`))).not.toThrow();
      expect(headersFor(`/practicas/http/${file}`)['x-robots-tag']).toBe('noindex');
    }
  });
});

describe("the shop's nginx configuration", () => {
  const es = read('practicas/tienda-http.conf');
  const en = read('practicas/shop-http.conf');

  /** What the server does, without the words that change with the language: directives and numbers. */
  const shape = (conf: string) =>
    conf
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => [line.split(/\s/)[0], ...(line.match(/\b\d{3,4}\b/g) ?? [])].join(' '));

  it('does the same in Spanish and in English', () => {
    expect(shape(en)).toEqual(shape(es));
  });

  it('listens on 8080, so the VM keeps its site on port 80 (Phase 1)', () => {
    for (const conf of [es, en]) {
      expect(conf).toMatch(/^\s*listen 8080;$/m);
      expect(conf).not.toMatch(/^\s*listen (\[::\]:)?80;$/m);
    }
  });

  it('explains how to install it with its own file name', () => {
    expect(es).toContain('sudo cp tienda-http.conf /etc/nginx/sites-available/tienda');
    expect(en).toContain('sudo cp shop-http.conf /etc/nginx/sites-available/shop');
  });

  it('is served as text, so it can be read before installing it', () => {
    for (const file of ['tienda-http.conf', 'shop-http.conf']) {
      expect(headersFor(`/practicas/${file}`)['content-type']).toBe('text/plain; charset=utf-8');
    }
  });
});
