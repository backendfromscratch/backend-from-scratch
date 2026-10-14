/** The messages between the page (client.ts) and the worker (worker.ts). */
import type { Reply } from './database';

export interface Request {
  id: number;
  sql: string;
  /** The shop's data: the worker loads it the first time. */
  setup: string;
}

export type Response = { id: number; ok: true; reply: Reply } | { id: number; ok: false };
