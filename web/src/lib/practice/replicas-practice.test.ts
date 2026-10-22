import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The practice material of Phase 9, lesson 6 (spec docs/specs/2026-10-20-phase-9-design.md, §5):
// a Compose file per language with a Redis primary and a replica the reader cuts off on purpose.
// There is no YAML parser in the project, so the files are read as text: they are short and flat.

const root = new URL('../../../public/practicas/replicas/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

const files = {
  es: { text: read('es/compose.yaml'), primary: 'principal', network: 'red' },
  en: { text: read('en/compose.yaml'), primary: 'primary', network: 'net' },
};

const digest = 'redis:8@sha256:2c2dff791878316e3b083188be0d578423b24813cdda5de0e80ea4f7b3e6bfd6';

/** The file's lines without comments or blank lines, and with Prettier's line wrapping undone. */
const code = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/^\s*#.*$/, '').trimEnd())
    .filter((line) => line.trim() !== '')
    .join('\n')
    .replace(/:\n\s+\[/g, ': [')
    .replace(/\[\s+/g, '[')
    .replace(/,?\s*\]/g, ']')
    .split('\n');

/** The file without comments, with each language's names replaced by neutral ones. */
const neutral = (lang: 'es' | 'en') =>
  code(files[lang].text)
    .join('\n')
    .replaceAll(files[lang].primary, 'PRIMARY')
    .replaceAll(new RegExp(`\\b${files[lang].network}\\b`, 'g'), 'NETWORK');

describe('the replica practice', () => {
  it('declares the same services and settings in both languages', () => {
    expect(neutral('es')).toEqual(neutral('en'));
    for (const { text, primary } of Object.values(files)) {
      const names = [...text.matchAll(/^ {2}([a-z]+):\s*$/gm)].map((m) => m[1]);
      expect(names.slice(0, 2)).toEqual([primary, 'replica']);
    }
  });

  it('makes the replica follow the primary', () => {
    for (const { text, primary } of Object.values(files)) {
      const lines = code(text).filter((line) => line.includes('--replicaof'));
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain(`'--replicaof', '${primary}', '6379'`);
    }
  });

  it('pins redis:8 by the project digest, in both services', () => {
    for (const { text } of Object.values(files)) {
      const images = [...text.matchAll(/^\s+image:\s*(\S+)/gm)].map((m) => m[1]);
      expect(images).toEqual([digest, digest]);
    }
  });

  it('publishes no port and joins a user-defined network named by the project', () => {
    for (const { text, network } of Object.values(files)) {
      expect(code(text).join('\n')).not.toMatch(/^\s*ports:/m);
      expect(text).toMatch(/^name: replicas$/m);
      expect(text).toMatch(new RegExp(`^networks:\\n  ${network}:`, 'm'));
    }
  });
});
