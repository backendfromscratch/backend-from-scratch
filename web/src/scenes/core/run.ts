/**
 * A run is one scene playing. It has its own clock, in milliseconds at normal speed, which advances
 * at the speed the reader chose and stops while paused. Every wait and every animation of the
 * scene goes through it, so pausing, changing the speed or cancelling reaches all of them at once.
 * A new scene cancels the previous run: whatever was pending rejects with Cancel and the old scene stops.
 */

/** Thrown into a scene that was cancelled (another scene started, or the stage was redrawn). */
export class Cancel extends Error {
  constructor() {
    super('The scene was cancelled');
    this.name = 'Cancel';
  }
}

/** What the run needs of an animation: the Web Animations API's Animation has all of it. */
export interface Playable {
  playState: string;
  playbackRate: number;
  finished: Promise<unknown>;
  pause(): void;
  play(): void;
  cancel(): void;
  updatePlaybackRate(rate: number): void;
}

interface Timer {
  /** When it ends, on the run's clock. */
  end: number;
  id: ReturnType<typeof setTimeout> | undefined;
  reject(error: Cancel): void;
  /** (Re)starts the real timeout for what is left, at the current speed. */
  arm(): void;
}

export class Run {
  /** Without time: every wait resolves at once (reduced motion, or a redraw at the final frame). */
  readonly instant: boolean;
  cancelled = false;
  paused = false;
  /** The scene has finished: the play button offers to repeat it. */
  done = false;
  rate: number;
  private base = 0;
  private at: number;
  private readonly now: () => number;
  private readonly animations = new Set<Playable>();
  private readonly timers = new Set<Timer>();

  constructor(options: { instant: boolean; rate: number; now?: () => number }) {
    this.instant = options.instant;
    this.rate = options.rate;
    this.now = options.now ?? (() => performance.now());
    this.at = this.now();
  }

  /** Milliseconds of scene so far, at normal speed. */
  clock(): number {
    return this.base + (this.paused ? 0 : (this.now() - this.at) * this.rate);
  }

  private rebase(): void {
    this.base = this.clock();
    this.at = this.now();
  }

  /** Throws Cancel if this run was cancelled: a scene calls it after anything it awaited. */
  guard(): void {
    if (this.cancelled) throw new Cancel();
  }

  wait(ms: number): Promise<void> {
    if (this.cancelled) return Promise.reject(new Cancel());
    if (this.instant || ms <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer: Timer = {
        end: this.clock() + ms,
        id: undefined,
        reject,
        arm: () => {
          clearTimeout(timer.id);
          timer.id = setTimeout(
            () => {
              this.timers.delete(timer);
              if (this.cancelled) reject(new Cancel());
              else resolve();
            },
            Math.max(0, (timer.end - this.clock()) / this.rate),
          );
        },
      };
      this.timers.add(timer);
      if (!this.paused) timer.arm();
    });
  }

  /** Puts an animation under the run's speed and pause; it is forgotten when it ends. */
  adopt<T extends Playable>(animation: T): T {
    if (!this.instant) {
      animation.playbackRate = this.rate;
      if (this.paused) animation.pause();
    }
    this.animations.add(animation);
    const forget = () => {
      this.animations.delete(animation);
    };
    animation.finished.then(forget, forget);
    return animation;
  }

  /** Waits for an animation; rejects with Cancel if the run was cancelled meanwhile. */
  async track(animation: Playable): Promise<void> {
    try {
      await animation.finished;
    } catch {
      throw new Cancel();
    }
    this.guard();
  }

  setPaused(paused: boolean): void {
    if (this.instant || this.done || this.cancelled || this.paused === paused) return;
    this.rebase();
    this.paused = paused;
    if (paused) {
      this.timers.forEach((timer) => clearTimeout(timer.id));
      this.animations.forEach((animation) => {
        if (animation.playState === 'running') animation.pause();
      });
    } else {
      this.timers.forEach((timer) => timer.arm());
      this.animations.forEach((animation) => {
        if (animation.playState === 'paused') animation.play();
      });
    }
  }

  setRate(rate: number): void {
    if (this.cancelled) return;
    this.rebase();
    this.rate = rate;
    if (this.instant) return;
    this.animations.forEach((animation) => animation.updatePlaybackRate(rate));
    if (!this.paused) this.timers.forEach((timer) => timer.arm());
  }

  cancel(): void {
    this.cancelled = true;
    this.animations.forEach((animation) => {
      try {
        animation.cancel();
      } catch {
        // It had already ended or been removed with its element.
      }
    });
    this.animations.clear();
    this.timers.forEach((timer) => {
      clearTimeout(timer.id);
      timer.reject(new Cancel());
    });
    this.timers.clear();
  }
}
