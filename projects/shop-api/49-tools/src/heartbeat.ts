// The worker's heartbeat (Phase 9, lesson 1). Docker asks the API whether it's fine through /health
// (the Dockerfile's HEALTHCHECK), but the worker isn't a server: there's nothing to ask it. So the
// worker says it itself: while it's taking jobs, every 5 seconds it writes to a file, and its
// healthcheck (compose.yaml) checks that the file is recent. A worker that is stuck (its process
// frozen, its event loop blocked) or shutting down stops writing, and after 30 seconds Docker
// considers it unhealthy.
import { writeFileSync } from 'node:fs';
import { log } from './log.ts';

// The file, inside the container: the healthcheck in compose.yaml looks for it here.
export const HEARTBEAT_FILE = '/tmp/heartbeat';

// #region heartbeat
// Every `everyMs`, if `alive()` says yes, it writes the time in the file, and with it the file's
// modification time changes, which is what the healthcheck reads. unref(): the interval doesn't keep
// the process alive on its own. If the file can't be written (without Docker, on a system without
// /tmp), it says so once and the worker goes on. Returns the function that stops it.
export function startHeartbeat(
  alive: () => boolean,
  { file = HEARTBEAT_FILE, everyMs = 5000 }: { file?: string; everyMs?: number } = {},
): () => void {
  let warned = false;
  const beat = () => {
    if (!alive()) return;
    try {
      writeFileSync(file, `${new Date().toISOString()}\n`);
    } catch (error) {
      if (!warned) {
        log.warn({ file, reason: (error as Error).message }, 'no heartbeat file');
        warned = true;
      }
    }
  };
  beat();
  const timer = setInterval(beat, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
// #endregion heartbeat
