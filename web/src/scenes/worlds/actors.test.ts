import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Every world's CSS is loaded on every scene lesson (Scene.astro imports them all), and an actor's
// rule, `[data-actor='server'] { grid-area: srv; }`, is global: two worlds with an actor of the
// same name must give it the same rule, or the one loaded last moves the other's actor.

const dir = fileURLToPath(new URL('./', import.meta.url));
const rules = readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((world) =>
    readdirSync(dir + world.name)
      .filter((name) => name.endsWith('.css'))
      .flatMap((name) => {
        const css = readFileSync(`${dir}${world.name}/${name}`, 'utf8');
        return [...css.matchAll(/^((?:\[data-actor='[^']+'\],?\s*)+)\{([^}]*)\}/gm)].flatMap(
          ([, selectors, body]) =>
            [...selectors!.matchAll(/\[data-actor='([^']+)'\]/g)].map(([, actor]) => ({
              world: world.name,
              actor: actor!,
              body: body!.replace(/\s+/g, ' ').trim(),
            })),
        );
      }),
  );

describe('actors shared between worlds', () => {
  it('finds the worlds’ actor rules', () => {
    expect(rules.length).toBeGreaterThan(20);
  });

  it('give an actor the same rule in every world that has it', () => {
    const byActor = new Map<string, Set<string>>();
    for (const { actor, body } of rules)
      byActor.set(actor, (byActor.get(actor) ?? new Set()).add(body));
    const clashes = [...byActor]
      .filter(([, bodies]) => bodies.size > 1)
      .map(([actor, bodies]) => `${actor}: ${[...bodies].join(' | ')}`);
    expect(clashes).toEqual([]);
  });
});
