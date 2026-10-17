import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The practice material of Phase 8, lesson 8 (spec docs/specs/2026-10-17-phase-8-design.md, §5):
// a Terraform root module per language that creates an nginx container with the Docker provider,
// and the paid path's Hetzner example, to read and never to apply. These tests keep both
// languages declaring the same things.

const root = new URL('../../../public/practicas/terraform/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

/** The names a Terraform file declares: «resource "type" "name"», «output "name"»... */
function declared(text: string, kind: 'resource' | 'output' | 'variable') {
  const quoted = kind === 'resource' ? '"([^"]+)"\\s+"([^"]+)"' : '"([^"]+)"';
  return [...text.matchAll(new RegExp(`^${kind}\\s+${quoted}\\s*\\{`, 'gm'))]
    .map((match) => match.slice(1).join('.'))
    .sort();
}

const es = read('es/main.tf');
const en = read('en/main.tf');

describe('the Docker provider practice', () => {
  it('declares the same resources, variables and outputs in both languages', () => {
    // Variable names are in each language («texto_pagina», «page_text»): only their number matches.
    for (const kind of ['resource', 'output'] as const) {
      expect(declared(es, kind)).toEqual(declared(en, kind));
    }
    expect(declared(es, 'variable')).toHaveLength(declared(en, 'variable').length);
    expect(declared(es, 'resource')).toEqual(['docker_container.web', 'docker_image.nginx']);
    expect(declared(es, 'output')).toEqual(['url']);
  });

  it('pins the docker provider to an exact version', () => {
    for (const text of [es, en]) {
      expect(text).toMatch(/source\s*=\s*"kreuzwerker\/docker"/);
      expect(text).toMatch(/version\s*=\s*"\d+\.\d+\.\d+"/);
    }
  });

  it('pins the nginx image by digest and publishes only on the loopback address', () => {
    for (const text of [es, en]) {
      expect(text).toMatch(/name\s*=\s*"nginx:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}"/);
      expect(text).toMatch(/ip\s*=\s*"127\.0\.0\.1"/);
      expect(text).toMatch(/external\s*=\s*8081/);
    }
  });
});

describe("the paid path's server example", () => {
  const files = { es: 'es/servidor.tf.ejemplo', en: 'en/server.tf.example' };

  it('is never a .tf file the CLI would load', () => {
    for (const dir of ['es', 'en']) {
      const names = readdirSync(new URL(`${dir}/`, root));
      expect(names.filter((name) => name.endsWith('.tf'))).toEqual(['main.tf']);
    }
    for (const file of Object.values(files)) expect(existsSync(new URL(file, root))).toBe(true);
  });

  it('declares the same resources in both languages, with secrets as variables', () => {
    const [esText, enText] = [read(files.es), read(files.en)];
    // Names are in each language («tienda», «shop»): the resource types and the counts match.
    const types = (text: string) => declared(text, 'resource').map((name) => name.split('.')[0]);
    expect(types(esText)).toEqual(types(enText));
    expect(types(esText)).toContain('hcloud_server');
    expect(types(esText)).toContain('cloudflare_dns_record');
    expect(declared(esText, 'variable')).toHaveLength(declared(enText, 'variable').length);
    expect(declared(esText, 'variable')).toContain('hcloud_token');
    for (const text of [esText, enText]) {
      expect(text).toMatch(/variable "hcloud_token"[^}]*sensitive\s*=\s*true/s);
      expect(text).not.toMatch(/ssh-(ed25519|rsa) AAAA/);
    }
  });
});

describe('the files are served as text', () => {
  it('has a rule in _headers for /practicas/terraform/', () => {
    const headers = readFileSync(new URL('../../../public/_headers', import.meta.url), 'utf8');
    expect(headers).toMatch(
      /^\/practicas\/terraform\/\*\n\s+Content-Type: text\/plain; charset=utf-8$/m,
    );
  });
});
