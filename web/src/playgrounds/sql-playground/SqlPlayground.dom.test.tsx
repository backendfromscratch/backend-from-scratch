// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { byText, click, render, type, waitFor } from '../dom-test';
import type { Reply } from './database';
import { strings } from './strings';

const t = strings.es;

// The engine is replaced: each run waits until the test answers it. database.test.ts covers the real one.
const session = vi.hoisted(() => ({
  runs: [] as { sql: string; resolve: (reply: Reply) => void; reject: (error: Error) => void }[],
  stops: 0,
}));
vi.mock('./client', async (original) => {
  const real = await original<typeof import('./client')>();
  return {
    ...real,
    fetchText: () => () => Promise.resolve(''),
    createSession: () => ({
      run: (sql: string) =>
        new Promise<Reply>((resolve, reject) => session.runs.push({ sql, resolve, reject })),
      stop: () => {
        session.stops++;
        for (const run of session.runs.splice(0)) run.reject(new real.StoppedError());
      },
    }),
  };
});

const { default: SqlPlayground } = await import('./SqlPlayground');
const text = (container: HTMLElement) => container.textContent ?? '';
const live = (container: HTMLElement) =>
  container.querySelector('[aria-live]')!.textContent!.trim();

beforeEach(() => {
  document.body.innerHTML = '';
  session.runs.length = 0;
  session.stops = 0;
});

describe('SqlPlayground with clicks', () => {
  it('runs the query and draws the table, with NULL shown apart', async () => {
    const { container } = await render(<SqlPlayground lang="es" />);
    await click(byText(container, 'button', t.run));
    expect(session.runs[0]!.sql).toBe('SELECT * FROM productos;');
    expect(text(container)).toContain(t.loading);
    session.runs[0]!.resolve({
      outputs: [
        {
          kind: 'rows',
          columns: ['id', 'nota'],
          rows: [
            ['1', null],
            ['2', 'x'],
          ],
          total: 2,
        },
      ],
    });
    await waitFor(() => container.querySelector('table') !== null);
    expect([...container.querySelectorAll('th')].map((th) => th.textContent)).toEqual([
      'id',
      'nota',
    ]);
    expect(container.querySelector('.sql-lab__null')?.textContent).toBe('NULL');
    expect(text(container)).toContain('(2 filas)');
    expect(live(container)).toBe('Resultado: 2 filas.');
  });

  it('shows the error as psql does, and announces it', async () => {
    const { container } = await render(
      <SqlPlayground lang="es" query="SELECT nombr FROM productos;" />,
    );
    await click(byText(container, 'button', t.run));
    session.runs[0]!.resolve({
      outputs: [],
      error: {
        message: 'column "nombr" does not exist',
        line: { number: 1, text: 'SELECT nombr FROM productos;', caret: 7 },
      },
    });
    await waitFor(() => container.querySelector('.sql-lab__error') !== null);
    expect(container.querySelector('.sql-lab__error')!.textContent).toBe(
      'ERROR:  column "nombr" does not exist\nLINE 1: SELECT nombr FROM productos;\n               ^',
    );
    expect(live(container)).toBe('Error: column "nombr" does not exist');
  });

  it('explains a psql command', async () => {
    const { container } = await render(<SqlPlayground lang="es" query="\dt" />);
    await click(byText(container, 'button', t.run));
    session.runs[0]!.resolve({ outputs: [], meta: '\\dt' });
    await waitFor(() => text(container).includes('es un comando de psql'));
  });

  it('a query that never ends: another click warns, Stop ends it and keeps the focus', async () => {
    const { container } = await render(<SqlPlayground lang="es" />);
    const stop = byText(container, 'button', t.stop);
    expect(stop.getAttribute('aria-disabled')).toBe('true');
    await click(byText(container, 'button', t.run));
    await click(byText(container, 'button', t.run));
    expect(live(container)).toBe(t.wait);
    expect(session.runs).toHaveLength(1);
    expect(stop.getAttribute('aria-disabled')).toBeNull();
    stop.focus();
    await click(stop);
    await waitFor(() => text(container).includes(t.stopped));
    expect(session.stops).toBe(1);
    expect(document.activeElement).toBe(stop);
    expect(stop.getAttribute('aria-disabled')).toBe('true');
  });

  it('if PostgreSQL cannot be loaded it says so, and the next click tries again', async () => {
    const { container } = await render(<SqlPlayground lang="es" />);
    await click(byText(container, 'button', t.run));
    session.runs[0]!.reject(new Error('offline'));
    await waitFor(() => text(container).includes(t.failed));
    await click(byText(container, 'button', t.run));
    expect(session.runs).toHaveLength(2);
    session.runs[1]!.resolve({ outputs: [{ kind: 'done', affected: 1 }] });
    await waitFor(() => text(container).includes(t.doneOne));
    expect(text(container)).not.toContain(t.failed);
  });

  it('Ctrl + Enter in the box runs what was typed', async () => {
    const { container } = await render(<SqlPlayground lang="es" />);
    const box = container.querySelector('textarea')!;
    await type(box, 'SELECT 2;');
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await waitFor(() => session.runs.length === 1);
    expect(session.runs[0]!.sql).toBe('SELECT 2;');
  });

  it('Reset data stops the engine and says the next query starts from the shop', async () => {
    const { container } = await render(<SqlPlayground lang="es" />);
    await click(byText(container, 'button', t.reset));
    expect(session.stops).toBe(1);
    expect(text(container)).toContain(t.restored);
  });

  it('after a stop, the next run says it starts again, not that it downloads', async () => {
    const { container } = await render(<SqlPlayground lang="es" />);
    await click(byText(container, 'button', t.run));
    session.runs[0]!.resolve({ outputs: [] });
    await waitFor(() => text(container).includes(t.nothing));
    await click(byText(container, 'button', t.reset));
    await click(byText(container, 'button', t.run));
    expect(text(container)).toContain(t.restarting);
    expect(text(container)).not.toContain(t.loading);
  });
});
