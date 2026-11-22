// The tests' fake model (test/fake-model.ts), as a server to practise with (Phase 11): the shop asks
// it instead of Claude's API, for free and with no key, and you see what the shop does when the API
// answers, fails or is slow. It answers every request with the same scenario, the one you choose:
//   normal   a short answer, which repeats your last question
//   429      too many requests, with retry-after: 3. The shop's SDK repeats the request twice,
//            waiting those 3 seconds, and the shop ends up answering 503
//   529      the API is overloaded, with no retry-after: the SDK repeats with its short waits
//   slow     a long answer, a piece every 250 ms: streamed, it arrives little by little; without
//            streaming, the whole answer, about 9 seconds later
// Run it with:
//   npm run fake-model                   the normal scenario, at http://127.0.0.1:4100
//   npm run fake-model -- 429            another one (or SCENARIO=429 npm run fake-model)
// and the shop, on your computer (npm run dev), with ANTHROPIC_BASE_URL=http://127.0.0.1:4100 and
// any key in .env. With Docker Compose, compose.yaml's fake-model service starts it on the shop's
// network (see the README). Each request it gets leaves a line: what the shop asked for and what it
// answers. Never use it outside your computer.
import { overloaded, rateLimited, startFakeModel, text, type Turn } from '../test/fake-model.ts';

// #region scenarios
// What the shop sent, with the API's names: just enough to answer.
interface ModelRequest {
  model?: string;
  stream?: boolean;
  messages?: { role: string; content: unknown }[];
}

// The text of the last question: the person's last message, if it's a text.
function lastQuestion(request: ModelRequest): string {
  const last = request.messages?.findLast((message) => message.role === 'user');
  return typeof last?.content === 'string' ? last.content : '(no text)';
}

const LONG =
  "I'll tell you slowly, piece by piece, the way a long answer from the model arrives: first a few " +
  'words, then some more, and so on until the end. Streamed, you see them arrive; without it, you ' +
  'wait until it is whole.';

// Each scenario decides its turn with the request in hand. A Map, and not an object, so the list
// comes out in this order: in an object, the keys that are numbers ('429') would go first.
export const SCENARIOS = new Map<string, (request: ModelRequest) => Turn>([
  [
    'normal',
    (request) =>
      text(
        `I'm the fake model: I understand nothing, I just repeat your last question. It was: "${lastQuestion(request)}".`,
      ),
  ],
  ['429', () => rateLimited(3)],
  ['529', () => overloaded()],
  ['slow', () => text(LONG, { pause: 250 })],
]);
// #endregion scenarios

// A line per request: what the shop asked for (the model, whether it's streamed, how many messages
// the conversation has) and what the fake model answers.
export function logLine(request: ModelRequest, turn: Turn): string {
  const messages = request.messages?.length ?? 0;
  const asked = `${request.model}, ${request.stream === true ? 'streamed' : 'in JSON'}, ${messages} ${messages === 1 ? 'message' : 'messages'}`;
  if (turn.kind === 'error') {
    const wait = turn.headers['retry-after'];
    return `→ ${asked} ← ${turn.status} ${turn.errorType}${wait ? `, retry-after: ${wait}` : ''}`;
  }
  if (turn.kind === 'silence') return `→ ${asked} ← (nothing)`;
  return `→ ${asked} ← 200, ${turn.stopReason}${turn.pause ? `, a piece every ${turn.pause} ms` : ''}`;
}

// #region start
// Starts the fake model with a scenario and returns its server. report writes each request.
export async function start(
  scenario: string,
  {
    port,
    host,
    report = () => {},
  }: { port?: number; host?: string; report?: (line: string) => void } = {},
) {
  const chosen = SCENARIOS.get(scenario);
  if (chosen === undefined) {
    throw new Error(
      `There is no "${scenario}" scenario. Choose one: ${[...SCENARIOS.keys()].join(', ')}`,
    );
  }
  return startFakeModel({
    port,
    host,
    fallback: (request: ModelRequest) => {
      const turn = chosen(request);
      report(logLine(request, turn));
      return turn;
    },
  });
}
// #endregion start

if (import.meta.main) {
  // The scenario: the first argument, or SCENARIO, or normal. The port and the address, like the
  // shop's: PORT (4100, if not) and HOST (127.0.0.1: only your computer; in Docker, 0.0.0.0).
  const scenario = process.argv[2] ?? process.env.SCENARIO ?? 'normal';
  try {
    const model = await start(scenario, {
      port: Number(process.env.PORT ?? 4100),
      host: process.env.HOST ?? '127.0.0.1',
      report: console.log,
    });
    // Ctrl + C, or docker compose stop: closes the server and ends.
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => void model.close().then(() => process.exit(0)));
    }
    console.log(`Fake model at ${model.url}, with the ${scenario} scenario (Ctrl + C stops it)`);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
