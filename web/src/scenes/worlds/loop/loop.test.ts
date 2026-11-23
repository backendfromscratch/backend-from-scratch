import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dequeue, enqueue, kindOf, mark, PEOPLE, QUEUE_SLOTS, SPOTS } from './loop';
import { strings } from './strings';

const langs = ['es', 'en'] as const;
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
/** Each language's lesson, the text the scenes draw. */
const lessons = {
  es: read('../../../content/docs/fase-3/event-loop-node.mdx'),
  en: read('../../../content/docs/en/phase-3/node-event-loop.mdx'),
};
/** Each language's example, `ejemplos/orden.ts` and `examples/order.ts`. */
const examples = {
  es: read('../../../../../projects/tienda-api/09-event-loop/ejemplos/orden.ts'),
  en: read('../../../../../projects/shop-api/09-event-loop/examples/order.ts'),
};
/** What the example prints, as the lesson's TryIt gives it: the output that starts with «1.». */
const printed = (text: string) => /output=\{`(1\. [\s\S]*?)`\}/.exec(text)?.[1]?.split('\n') ?? [];

describe('the queue', () => {
  it('lets the first one in out first', () => {
    const queue = enqueue(enqueue([], 'luis'), 'ana');
    expect(queue).toEqual(['luis', 'ana']);
    expect(dequeue(queue)).toEqual(['ana']);
  });

  it('holds what its drawing holds, and the event loop never takes from an empty one', () => {
    const full = enqueue(enqueue(enqueue([], 'req1'), 'req2'), 'req3');
    expect(full).toHaveLength(QUEUE_SLOTS);
    expect(() => enqueue(full, 'file')).toThrow();
    expect(() => dequeue([])).toThrow();
  });

  it('colours a request as HTTP and a piece of your code as what the server runs', () => {
    expect(kindOf('products')).toBe('http');
    expect(kindOf('then')).toBe('tcp');
    expect(kindOf('result')).toBe('tcp');
  });
});

describe('the ten people', () => {
  it('show their number, a check once served, and the tenth its wait', () => {
    expect(mark(3, 2, '15 s')).toBe('3');
    expect(mark(3, 3, '15 s')).toBe('✓');
    expect(mark(PEOPLE, PEOPLE - 1, '15 s')).toBe(String(PEOPLE));
    expect(mark(PEOPLE, PEOPLE, '15 s')).toBe('15 s');
  });
});

describe('the waiter', () => {
  it('walks to the tables in order, and the kitchen’s pass is past the last one', () => {
    expect(SPOTS[1]).toBeLessThan(SPOTS[2]);
    expect(SPOTS[2]).toBeLessThan(SPOTS[3]);
    expect(SPOTS[3]).toBeLessThan(SPOTS.pass);
  });
});

describe.each(langs)('the loop world, in %s', (lang) => {
  const t = strings[lang];
  const text = lessons[lang];

  it('prints each `curl` output and each diagram’s answer as the lesson gives it', () => {
    for (const output of Object.values(t.outputs)) expect(text).toContain(output);
  });

  it('calls the routes as the lesson does', () => {
    for (const route of Object.values(t.routes)) expect(text).toContain(`localhost:3000${route}`);
    for (const item of ['products', 'slow', 'slowAsync'] as const)
      expect(text).toContain(t.items[item].replace('GET ', ''));
  });

  it('runs the example’s four statements, in its order', () => {
    let from = 0;
    for (const line of t.code.lines) {
      const at = examples[lang].indexOf(line.split('(')[0]!, from);
      expect(at, line).toBeGreaterThan(-1);
      from = at + 1;
    }
    expect(examples[lang]).toContain(t.output.cmd);
    expect(text).toContain(t.output.cmd);
  });

  it('prints the start of each line of the example’s output, in the lesson’s order', () => {
    const lines = printed(text);
    expect(lines).toHaveLength(4);
    t.output.lines.forEach((line, i) =>
      expect(lines[i]!.startsWith(line.replace(/…$/, ''))).toBe(true),
    );
  });

  it('fits every label in its slot: 21 characters at most (loop.css)', () => {
    for (const label of Object.values(t.items)) expect([...label].length).toBeLessThanOrEqual(21);
    for (const output of Object.values(t.outputs))
      expect([...output].length).toBeLessThanOrEqual(21);
    for (const route of Object.values(t.routes)) expect([...route].length).toBeLessThanOrEqual(16);
    for (const clock of [...Object.values(t.clocks), t.tenth])
      expect([...clock].length).toBeLessThanOrEqual(10);
    expect([...t.tenth].length).toBeLessThanOrEqual(4);
  });

  it('has the text’s four ways out, and its three tables', () => {
    expect(t.ways.rows).toHaveLength(4);
    expect(t.tables).toHaveLength(3);
  });
});
