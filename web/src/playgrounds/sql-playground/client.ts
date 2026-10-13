/**
 * The page's side of the playground: starts the worker on the first run, sends each query and
 * waits for its reply. Stopping ends the worker, and with it the data: the next run starts again
 * from the shop's data, which is also how «Restaurar datos» works.
 */
import type { Reply } from './database';
import type { Request, Response } from './protocol';

export class StoppedError extends Error {
  constructor() {
    super('stopped');
  }
}

export interface WorkerLike {
  postMessage(request: Request): void;
  terminate(): void;
  onmessage: ((event: { data: Response }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface Session {
  run(sql: string): Promise<Reply>;
  stop(): void;
}

const startModuleWorker = (): WorkerLike =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

/** Downloads a text file; a failed answer is an error too. */
export const fetchText = (url: string) => async () => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.text();
};

export function createSession(
  loadSetup: () => Promise<string>,
  startWorker: () => WorkerLike = startModuleWorker,
): Session {
  let setup: Promise<string> | undefined;
  let worker: WorkerLike | undefined;
  let nextId = 1;
  // Goes up on every stop: a run that was still downloading the data when stopped must not start.
  let stops = 0;
  const pending = new Map<
    number,
    { resolve: (reply: Reply) => void; reject: (error: Error) => void }
  >();

  const rejectAll = (error: Error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };

  const end = (error: Error) => {
    worker?.terminate();
    worker = undefined;
    rejectAll(error);
  };

  const ensureWorker = () => {
    if (worker) return worker;
    const started = startWorker();
    started.onmessage = ({ data }) => {
      const waiting = pending.get(data.id);
      if (!waiting) return;
      pending.delete(data.id);
      if (data.ok) waiting.resolve(data.reply);
      else waiting.reject(new Error('engine'));
    };
    started.onerror = () => end(new Error('worker'));
    worker = started;
    return started;
  };

  return {
    async run(sql) {
      const stopsBefore = stops;
      setup ??= loadSetup();
      let data: string;
      try {
        data = await setup;
      } catch (error) {
        setup = undefined;
        throw error;
      }
      if (stops !== stopsBefore) throw new StoppedError();
      const id = nextId++;
      return new Promise<Reply>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ensureWorker().postMessage({ id, sql, setup: data });
      });
    },
    stop: () => {
      stops++;
      end(new StoppedError());
    },
  };
}
