// Each customer's budget (Phase 11, lesson 7): how many tokens they can spend a day on the
// assistant. The question limits (rate-limits.ts) count questions; but one question can cost 2000
// tokens or 20,000 (five rounds with tools, a long conversation), and what the shop pays for is
// tokens. So, on top of them, each customer has a daily budget, in tokens:
//   - before asking the model, what they have spent today is checked; if they've already reached
//     the budget, 429 with Retry-After until midnight (UTC), and the model doesn't even notice;
//   - after every call to the model, its tokens are added (assistant/cost.ts, tokensOf).
// It's checked before and charged after, so the day's last question can go a bit over: what one
// question costs, at most (five rounds, with MAX_TOKENS of output each).
// The day is the UTC one, the same for everybody: simple to count in Redis, and without asking each
// customer their time zone.
import type { Context } from 'hono';
import { config } from '../config.ts';
import { log } from '../log.ts';
import { problem, problemType } from '../problems.ts';
import { redisClient, withinTime } from '../rate-limits.ts';
import { createRedisBudgetStore } from '../redis-store.ts';

// #region store
// Where what has been spent is noted: one count per customer and day. In Redis (redis-store.ts)
// with REDIS_URL, shared by all the copies of the API, like the limits; without Redis, in this
// server's memory. expiresAt: the instant (in ms) from which that count is no longer used.
export interface BudgetStore {
  /** The tokens noted in that key (0 if there are none). */
  spent(key: string): Promise<number>;
  /** Adds tokens to that key, which expires at expiresAt (ms). */
  add(key: string, tokens: number, expiresAt: number): Promise<void>;
}

export function createMemoryBudgetStore(clock = Date.now): BudgetStore {
  const byKey = new Map<string, { tokens: number; expiresAt: number }>();
  return {
    async spent(key) {
      const entry = byKey.get(key);
      return entry !== undefined && entry.expiresAt > clock() ? entry.tokens : 0;
    },
    async add(key, tokens, expiresAt) {
      // The counts that have already expired (the ones of past days), out: otherwise they'd grow
      // without stopping.
      for (const [other, entry] of byKey) {
        if (entry.expiresAt <= clock()) byKey.delete(other);
      }
      byKey.set(key, { tokens: (byKey.get(key)?.tokens ?? 0) + tokens, expiresAt });
    },
  };
}
// #endregion store

// #region day
const ONE_DAY = 24 * 60 * 60 * 1000;

// The UTC day of an instant (2026-11-21) and the instant of the UTC midnight it ends at. Date.UTC
// reads the 32nd day of a month as the 1st of the next one, so month and year ends come out on
// their own.
export function utcDay(instant: number): { day: string; midnight: number } {
  const date = new Date(instant);
  return {
    day: date.toISOString().slice(0, 10),
    midnight: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  };
}
// #endregion day

// #region budget
export interface BudgetStatus {
  allowed: boolean;
  spent: number; // today's tokens
  max: number;
  retryAfter: number; // if it isn't allowed, the seconds left until midnight (UTC)
}

// The store doesn't answer (or not in time): the budget closes, and the route answers 503.
export class BudgetUnavailable extends Error {
  constructor(reason: string) {
    super(`the budget can't ask its store: ${reason}`);
    this.name = 'BudgetUnavailable';
  }
}

// clock: where the time comes from (the tests give it their own, to be a minute from midnight).
// wait: how many ms the store is waited for, at most (withinTime, in rate-limits.ts).
export function createBudget({
  max,
  store,
  clock = Date.now,
  wait = 200,
}: {
  max: number;
  store: BudgetStore;
  clock?: () => number;
  wait?: number;
}) {
  const key = (customerId: number, day: string) => `${customerId}:${day}`;
  return {
    max,
    // Before asking the model. If Redis doesn't answer in wait ms, or gives an error, it throws
    // BudgetUnavailable: it closes, like the assistant's limits, because what it protects is money.
    // Questions without a budget while Redis is down are exactly the spending it exists to stop.
    async check(customerId: number): Promise<BudgetStatus> {
      const now = clock();
      const { day, midnight } = utcDay(now);
      let spent: number;
      try {
        spent = await withinTime(() => store.spent(key(customerId, day)), wait);
      } catch (error) {
        throw new BudgetUnavailable((error as Error).message);
      }
      const allowed = spent < max;
      const retryAfter = allowed ? 0 : Math.ceil((midnight - now) / 1000);
      return { allowed, spent, max, retryAfter };
    },
    // After every call to the model. The call is already made (and paid for): if Redis fails now,
    // there's no point refusing the customer their answer. Only a warning in the log, with context
    // (the requestId), and those tokens stay unnoted. The count expires a day after its midnight:
    // until then you can look at what each customer spent yesterday.
    async charge(
      customerId: number,
      tokens: number,
      context: Record<string, unknown> = {},
    ): Promise<void> {
      if (tokens <= 0) return;
      const { day, midnight } = utcDay(clock());
      try {
        await withinTime(() => store.add(key(customerId, day), tokens, midnight + ONE_DAY), wait);
      } catch (error) {
        log.warn(
          { ...context, tokens, reason: (error as Error).message },
          "what was spent couldn't be noted in the customer's budget",
        );
      }
    },
  };
}

export type Budget = ReturnType<typeof createBudget>;
// #endregion budget

// #region shop-budget
// The shop's: DAILY_TOKEN_BUDGET (config.ts) per customer. The store, in Redis with REDIS_URL (in
// Compose), over the same connection as the limits. It's exported for the tests, which change its
// functions.
export const budgetStore = redisClient
  ? createRedisBudgetStore(redisClient)
  : createMemoryBudgetStore();

export const budget = createBudget({ max: config.DAILY_TOKEN_BUDGET, store: budgetStore });
// #endregion shop-budget

// #region responses
// 429 Too Many Requests, like the question limits, but with another type: it isn't that they ask
// too fast, it's that today they've already spent theirs. Retry-After: the seconds until midnight
// (UTC).
export function budgetExhausted(c: Context, status: BudgetStatus) {
  return problem(
    c,
    {
      type: problemType('budget-exhausted'),
      title: "You've spent today's assistant budget",
      status: 429,
      detail: `Today you've already used ${status.spent} of your ${status.max} assistant tokens: come back from 00:00 UTC, in ${status.retryAfter} seconds`,
    },
    { 'Retry-After': String(status.retryAfter) },
  );
}

// 503: the budget can't be checked (BudgetUnavailable). Retry-After: 5, like storeUnavailable
// (rate-limits.ts): it isn't that they've spent too much, it's that the shop can't count it now.
export function budgetUnchecked(c: Context) {
  return problem(
    c,
    {
      type: problemType('budget-unchecked'),
      title: "The budget can't be checked",
      status: 503,
      detail: "Right now the assistant can't answer. Try again in a few seconds",
    },
    { 'Retry-After': '5' },
  );
}
// #endregion responses
