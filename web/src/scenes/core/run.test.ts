import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cancel, Run, type Playable } from './run';

/** An animation that records what the run asks of it and never finishes on its own. */
function fakeAnimation(): Playable & { calls: string[] } {
  const calls: string[] = [];
  let state = 'running';
  return {
    calls,
    playbackRate: 1,
    finished: new Promise(() => {}),
    get playState() {
      return state;
    },
    pause() {
      state = 'paused';
      calls.push('pause');
    },
    play() {
      state = 'running';
      calls.push('play');
    },
    cancel() {
      calls.push('cancel');
    },
    updatePlaybackRate(rate: number) {
      calls.push(`rate ${rate}`);
    },
  };
}

const playing = (rate = 1) => new Run({ instant: false, rate, now: () => Date.now() });

/** Whether a promise has settled, without waiting for it. */
function watch(promise: Promise<unknown>): { settled: () => boolean } {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  return { settled: () => settled };
}

describe('a run', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits the time it is asked at normal speed', async () => {
    const wait = watch(playing().wait(1000));
    await vi.advanceTimersByTimeAsync(999);
    expect(wait.settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(wait.settled()).toBe(true);
  });

  it('waits less real time at a faster speed', async () => {
    const wait = watch(playing(1.6).wait(1000));
    await vi.advanceTimersByTimeAsync(620);
    expect(wait.settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(10);
    expect(wait.settled()).toBe(true);
  });

  it('stops its clock and its waits while paused', async () => {
    const run = playing();
    const wait = watch(run.wait(1000));
    await vi.advanceTimersByTimeAsync(400);
    run.setPaused(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(run.clock()).toBe(400);
    expect(wait.settled()).toBe(false);
    run.setPaused(false);
    await vi.advanceTimersByTimeAsync(599);
    expect(wait.settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(wait.settled()).toBe(true);
  });

  it('stretches what is left of a wait when the speed changes', async () => {
    const run = playing();
    const wait = watch(run.wait(1000));
    await vi.advanceTimersByTimeAsync(500);
    run.setRate(0.6);
    await vi.advanceTimersByTimeAsync(830);
    expect(wait.settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(10);
    expect(wait.settled()).toBe(true);
  });

  it('rejects what is pending when it is cancelled', async () => {
    const run = playing();
    const wait = run.wait(1000);
    run.cancel();
    await expect(wait).rejects.toBeInstanceOf(Cancel);
    expect(() => run.guard()).toThrow(Cancel);
  });

  it('takes charge of animations: speed, pause, play and cancel', () => {
    const run = playing(1.6);
    run.setPaused(true);
    const animation = run.adopt(fakeAnimation());
    expect(animation.playbackRate).toBe(1.6);
    expect(animation.calls).toEqual(['pause']);
    run.setPaused(false);
    run.setRate(0.6);
    run.cancel();
    expect(animation.calls).toEqual(['pause', 'play', 'rate 0.6', 'cancel']);
  });

  it('does not wait at all when instant (reduced motion, a redraw)', async () => {
    const run = new Run({ instant: true, rate: 1, now: () => Date.now() });
    await expect(run.wait(5000)).resolves.toBeUndefined();
    run.setPaused(true);
    expect(run.paused).toBe(false);
  });

  it('cannot be paused once it has ended', () => {
    const run = playing();
    run.done = true;
    run.setPaused(true);
    expect(run.paused).toBe(false);
  });
});
