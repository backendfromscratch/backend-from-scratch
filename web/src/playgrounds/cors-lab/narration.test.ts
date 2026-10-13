import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  allowableHeaders,
  bodyTypes,
  credentialsModes,
  methods,
  run,
  scenarios,
  type AllowOrigin,
  type Settings,
} from './cors';
import { listOf, narrate, rowDescription, rowText } from './narration';
import { strings } from './strings';

/** Every combination of the controls that changes the path: about two thousand runs. */
function everySetting(): Settings[] {
  const all: Settings[] = [];
  const origins: AllowOrigin[] = ['absent', '*', 'page', 'other'];
  for (const method of methods)
    for (const body of bodyTypes)
      for (const authorization of [false, true])
        for (const credentials of credentialsModes)
          for (const destination of ['api', 'same'] as const)
            for (const answersOptions of [false, true])
              for (const allowOrigin of origins)
                for (const allowCredentials of [false, true])
                  all.push({
                    request: { method, body, authorization, credentials, destination },
                    server: {
                      answersOptions,
                      allowOrigin,
                      allowMethods: ['GET', 'POST'],
                      allowHeaders: [allowableHeaders[0]],
                      allowCredentials,
                    },
                  });
  return all;
}

describe.each(['es', 'en'] as const)('in %s', (lang) => {
  const t = strings[lang];

  it('every step of every run has its sentence, its label and its description, all filled in', () => {
    for (const settings of everySetting()) {
      run(settings, t.names).steps.forEach((step, index) => {
        const texts = [
          narrate(t, step),
          rowText(t, step).label,
          rowDescription(t, step, index + 1),
        ];
        for (const text of texts) {
          expect(text.length, step.key).toBeGreaterThan(0);
          expect(text, step.key).not.toMatch(/\{\w+\}|undefined/);
        }
      });
    }
  });

  it('the usual error: the request reached the server, as the spec’s example says', () => {
    const failed = run(scenarios['usual-error'], t.names).steps.find(
      (s) => s.key === 'check-fails',
    );
    expect(narrate(t, failed!)).toContain('Access-Control-Allow-Origin');
    expect(narrate(t, failed!)).toContain('GET');
  });

  it('a row reads in full: who, to whom, what and with which headers', () => {
    const { steps } = run(scenarios['post-json'], t.names);
    const preflight = steps.findIndex((s) => s.key === 'preflight-sent');
    const description = rowDescription(t, steps[preflight]!, preflight + 1);
    expect(description).toContain(t.actors.browser);
    expect(description).toContain(t.actors.server);
    expect(description).toContain(`OPTIONS ${t.names.apiPath}`);
    expect(description).toContain(`Access-Control-Request-Method${t.colon}POST`);
  });

  it('the real request after a failed preflight says it is not sent', () => {
    const { steps } = run(scenarios['post-json'], t.names);
    const index = steps.findIndex((s) => s.key === 'preflight-fails');
    expect(rowDescription(t, steps[index]!, index + 1)).toContain(t.notSent);
  });
});

describe('listOf', () => {
  it('joins with commas and the language’s «and»', () => {
    expect(listOf(strings.es, ['a'])).toBe('a');
    expect(listOf(strings.es, ['a', 'b'])).toBe('a y b');
    expect(listOf(strings.en, ['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('strings', () => {
  const shape = (value: unknown): unknown =>
    value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]))
      : typeof value;

  it('both languages have the same keys', () => {
    expect(shape(strings.en)).toEqual(shape(strings.es));
  });
});

describe('the approved preflight is what the shop’s nginx sends', () => {
  const conf = { es: 'tienda-http.conf', en: 'shop-http.conf' } as const;

  it.each(['es', 'en'] as const)('in %s', (lang) => {
    const file = readFileSync(
      fileURLToPath(new URL(`../../../public/practicas/${conf[lang]}`, import.meta.url)),
      'utf8',
    );
    // The OPTIONS block of location /api/: its add_header lines, without Max-Age and Vary.
    const block = file.slice(file.indexOf('if ($request_method = OPTIONS)'));
    const sent = Object.fromEntries(
      [...block.slice(0, block.indexOf('return 204')).matchAll(/add_header (\S+) "([^"]+)"/g)].map(
        ([, name, value]) => [name, value],
      ),
    );
    const { steps } = run(scenarios['preflight-approved'], strings[lang].names);
    const answered = steps.find((s) => s.key === 'preflight-answered');
    expect(Object.fromEntries(answered && 'headers' in answered ? answered.headers : [])).toEqual(
      sent,
    );
  });
});
