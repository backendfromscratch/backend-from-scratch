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

// A view's layout is global too: `.scene-stage[data-view='pair'] .scene-layout { … }` in one world's
// CSS also lays out another world's view of the same name. So no two worlds may share a view name.
const views = readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((world) => {
    const module = readFileSync(`${dir}${world.name}/${world.name}.ts`, 'utf8');
    const block = /\bviews:\s*\{([\s\S]*?)\n {2}\}/.exec(module)?.[1] ?? '';
    return [...block.matchAll(/^\s*'?([\w-]+)'?:\s*\[/gm)].map(([, view]) => ({
      world: world.name,
      view: view!,
    }));
  });

describe('views of different worlds', () => {
  it('finds the worlds’ views', () => {
    expect(views.length).toBeGreaterThan(40);
  });

  it('never share a name', () => {
    const worldsOf = new Map<string, string[]>();
    for (const { world, view } of views) worldsOf.set(view, [...(worldsOf.get(view) ?? []), world]);
    const shared = [...worldsOf]
      .filter(([, worlds]) => worlds.length > 1)
      .map(([view, worlds]) => `${view}: ${worlds.join(', ')}`);
    expect(shared).toEqual([]);
  });
});

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

// A narrow or short stage's override must come after the rule it overrides: with the same
// specificity, the later rule wins, and an override placed before its base rule never applies (the
// pilot's phone sizes did not, until 2026-11-21). Prettier writes each @container block's end as a
// `}` at the start of a line, so blocks and rules can be read with patterns.
const lateBases = readdirSync(dir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((world) =>
    readdirSync(dir + world.name)
      .filter((name) => name.endsWith('.css'))
      .flatMap((name) => {
        const css = readFileSync(`${dir}${world.name}/${name}`, 'utf8').replace(
          /\/\*[\s\S]*?\*\//g,
          (comment) => ' '.repeat(comment.length),
        );
        const props = (body: string) =>
          [...body.matchAll(/([\w-]+)\s*:/g)].map(([, prop]) => prop!);
        const overrides = [...css.matchAll(/@container[^{]*\{([\s\S]*?)\n\}/g)].flatMap((block) =>
          [...block[1]!.matchAll(/^\s+([^{}@]+)\{([^}]*)\}/gm)].flatMap(([, selectors, body]) =>
            selectors!.split(',').map((selector) => ({
              selector: selector.trim(),
              props: props(body!),
              at: block.index,
            })),
          ),
        );
        const outside = css.replace(/@container[^{]*\{[\s\S]*?\n\}/g, (block) =>
          ' '.repeat(block.length),
        );
        const rules = [...outside.matchAll(/^([^{}@\s][^{}]*)\{([^}]*)\}/gm)].flatMap((rule) =>
          rule[1]!.split(',').map((selector) => ({
            selector: selector.trim(),
            props: props(rule[2]!),
            at: rule.index,
          })),
        );
        return overrides.flatMap((override) =>
          rules
            .filter(
              (rule) =>
                rule.selector === override.selector &&
                rule.at > override.at &&
                rule.props.some((prop) => override.props.includes(prop)),
            )
            .map(
              (rule) => `${world.name}/${name}: ${override.selector} (${rule.props.join(', ')})`,
            ),
        );
      }),
  );

describe('narrow and short stages', () => {
  it('override their base rules from after them', () => {
    expect(lateBases).toEqual([]);
  });
});
