import { describe, expect, it, vi } from 'vitest';
import { createSession, StoppedError, type WorkerLike } from './client';
import type { Request } from './protocol';

/** A worker that answers when the test says so. */
class FakeWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  sent: Request[] = [];
  terminated = false;
  postMessage(request: Request) {
    this.sent.push(request);
  }
  terminate() {
    this.terminated = true;
  }
  answer(index = this.sent.length - 1) {
    this.onmessage?.({ data: { id: this.sent[index]!.id, ok: true, reply: { outputs: [] } } });
  }
}

const setup = () => Promise.resolve('CREATE TABLE t (x int);');

describe('createSession', () => {
  it('starts the worker on the first run, sends the data and the query, and resolves with the reply', async () => {
    const workers: FakeWorker[] = [];
    const session = createSession(setup, () => {
      workers.push(new FakeWorker());
      return workers.at(-1)!;
    });
    expect(workers).toHaveLength(0);
    const reply = session.run('SELECT 1');
    await vi.waitFor(() => expect(workers[0]?.sent).toHaveLength(1));
    expect(workers[0]!.sent[0]).toMatchObject({
      sql: 'SELECT 1',
      setup: 'CREATE TABLE t (x int);',
    });
    workers[0]!.answer();
    await expect(reply).resolves.toEqual({ outputs: [] });
  });

  it('stop ends the worker, rejects what was running, and the next run starts a fresh one', async () => {
    const workers: FakeWorker[] = [];
    const session = createSession(setup, () => {
      workers.push(new FakeWorker());
      return workers.at(-1)!;
    });
    const running = session.run('SELECT forever');
    await vi.waitFor(() => expect(workers[0]?.sent).toHaveLength(1));
    session.stop();
    await expect(running).rejects.toBeInstanceOf(StoppedError);
    expect(workers[0]!.terminated).toBe(true);
    const next = session.run('SELECT 1');
    await vi.waitFor(() => expect(workers[1]?.sent).toHaveLength(1));
    workers[1]!.answer();
    await expect(next).resolves.toEqual({ outputs: [] });
  });

  it('stopped while the data is still downloading, it never starts the query', async () => {
    let finish!: (data: string) => void;
    const load = () => new Promise<string>((resolve) => (finish = resolve));
    const workers: FakeWorker[] = [];
    const session = createSession(load, () => {
      workers.push(new FakeWorker());
      return workers.at(-1)!;
    });
    const running = session.run('SELECT 1');
    session.stop();
    finish('CREATE TABLE t (x int);');
    await expect(running).rejects.toBeInstanceOf(StoppedError);
    expect(workers).toHaveLength(0);
  });

  it('if the data cannot be downloaded, it fails, and tries again on the next run', async () => {
    let calls = 0;
    const load = () => (++calls === 1 ? Promise.reject(new Error('offline')) : setup());
    const worker = new FakeWorker();
    const session = createSession(load, () => worker);
    await expect(session.run('SELECT 1')).rejects.toThrow('offline');
    const next = session.run('SELECT 1');
    await vi.waitFor(() => expect(worker.sent).toHaveLength(1));
    worker.answer();
    await expect(next).resolves.toEqual({ outputs: [] });
  });

  it('if the worker breaks, the run fails and the next one starts another worker', async () => {
    const workers: FakeWorker[] = [];
    const session = createSession(setup, () => {
      workers.push(new FakeWorker());
      return workers.at(-1)!;
    });
    const running = session.run('SELECT 1');
    await vi.waitFor(() => expect(workers[0]?.sent).toHaveLength(1));
    workers[0]!.onerror?.(new Event('error'));
    await expect(running).rejects.toThrow();
    void session.run('SELECT 1');
    await vi.waitFor(() => expect(workers[1]?.sent).toHaveLength(1));
  });
});
