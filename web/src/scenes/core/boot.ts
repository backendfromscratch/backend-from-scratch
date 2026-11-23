/**
 * Starts a scene lesson (docs/specs/2026-11-20-visual-lessons-design.md, §2): finds the cues in the
 * text, loads the lesson's choreography and plays each part's scene when its cue reaches the reading
 * line. It also runs the panel's controls, the line between scene and text, and the fold on a phone.
 * The reader's fold and text width are applied before the first paint by TwoColumnContent.astro's
 * inline script (the root's `data-scene-folded` and `--scene-text-w`); this module keeps them.
 */
import { fill } from '../../lib/fill';
import { SCENE_FOLD_KEY, SCENE_SPEED_KEY, SCENE_SPLIT_KEY, safeStorage } from '../../lib/storage';
import { activeCue, readingLine } from './cues';
import { Captioner, makeDirector } from './director';
import { Cancel, Run } from './run';
import { clampText, splitLimits, splitValues } from './split';
import { Stage } from './stage';
import { SPEEDS, isSpeed, nextSpeed, smallResize, type Speed } from './timing';
import type { LessonModule, Locale, Options, SceneDef } from './types';

/** The page's fonts: the first scene waits for them (at most 2.5 s), since they change every size. */
const FONTS = [
  '400 1em "JetBrains Mono Variable"',
  '700 1em "JetBrains Mono Variable"',
  '400 1em "Atkinson Hyperlegible Next Variable"',
  '700 1em "Atkinson Hyperlegible Next Variable"',
];

/**
 * For the browser tests only: `?scene-rate=8` plays every scene 8 times faster (1 to 20), so a test
 * can watch each scene to its end (web/e2e/scenes.e2e.ts). Readers never see it.
 */
function testRate(): number {
  const asked = Number(new URLSearchParams(location.search).get('scene-rate'));
  return Number.isFinite(asked) && asked >= 1 ? Math.min(20, asked) : 1;
}

/** The interface strings the panel passes in `data-strings` (ScenePanel.astro). */
interface PanelStrings {
  pause: string;
  resume: string;
  replay: string;
  speed: string;
  speeds: Record<Speed, string>;
  splitValue: string;
  fold: string;
  unfold: string;
  paused: string;
  dot: string;
}

/**
 * Called by the lesson's own client entry (lessons/<translationKey>.astro), which imports its
 * choreography: each scene lesson downloads its own module and no other lesson's.
 */
export function boot<S>(lesson: LessonModule<S>): void {
  const panel = document.querySelector<HTMLElement>('.scene-panel');
  if (panel) start(panel, lesson);
}

function start<S>(panel: HTMLElement, lesson: LessonModule<S>): void {
  const lang: Locale = panel.dataset.lang === 'en' ? 'en' : 'es';
  const ui = JSON.parse(panel.dataset.strings ?? '{}') as PanelStrings;
  const store = safeStorage(() => window.localStorage);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const pane = panel.parentElement!;
  const main = pane.querySelector('main')!;
  const content = main.querySelector<HTMLElement>('.sl-markdown-content')!;
  const stage = new Stage(panel.querySelector<HTMLElement>('.scene-stage')!);
  const captions = new Captioner(stage.caption);
  const instrument = lesson.instrument?.create(panel, lang) ?? null;
  const options: Options = {};
  const rateOf = (s: Speed) => SPEEDS[s] * testRate();
  const $ = <T extends Element = HTMLElement>(selector: string) => panel.querySelector<T>(selector);
  stage.root.dataset.paused = ui.paused;

  // ---------- the cues and the parts of the text they open
  const cueElements = [...content.querySelectorAll<HTMLElement>('.scene-cue')];
  const end = cueElements.find((cue) => cue.hasAttribute('data-scene-end')) ?? null;
  const cues = cueElements.filter((cue) => cue !== end);
  const scenes: SceneDef<S>[] = [];
  for (const cue of cues) {
    const scene = lesson.scenes.find((s) => s.id === cue.dataset.scene);
    if (!scene) {
      console.error(
        `[scenes] The text has a cue «${cue.dataset.scene}» that the lesson module does not have`,
      );
      return;
    }
    scenes.push(scene);
  }
  if (scenes.length === 0) return;
  /** What a cue measures: the element after it (the cue itself is hidden). */
  const anchor = (cue: HTMLElement) =>
    (cue.nextElementSibling as HTMLElement | null) ?? cue.parentElement!;
  /** The blocks of a part: from its cue to the next cue (or the end). */
  const blocks = (index: number): HTMLElement[] => {
    const stop = cueElements[cueElements.indexOf(cues[index]!) + 1] ?? null;
    const found: HTMLElement[] = [];
    for (let el = cues[index]!.nextElementSibling; el && el !== stop; el = el.nextElementSibling) {
      if (el instanceof HTMLElement && !el.classList.contains('scene-cue')) found.push(el);
    }
    return found;
  };

  // ---------- the part bar in the gutter of the text
  const bar = document.createElement('div');
  bar.className = 'scene-part-bar';
  bar.setAttribute('aria-hidden', 'true');
  bar.hidden = true;
  main.append(bar);
  let ended = false;
  let reading: HTMLElement[] = [];
  function placeBar(): void {
    const part = ended ? [] : blocks(current);
    for (const block of reading) if (!part.includes(block)) block.classList.remove('is-reading');
    for (const block of part) block.classList.add('is-reading');
    reading = part;
    if (part.length === 0) {
      bar.hidden = true;
      return;
    }
    const origin = main.getBoundingClientRect().top;
    // A little air above the heading and under the last block, as a highlighted line has.
    const top = part[0]!.getBoundingClientRect().top - origin - 6;
    const bottom = part[part.length - 1]!.getBoundingClientRect().bottom - origin + 6;
    bar.dataset.kind = scenes[current]!.kind;
    bar.style.transform = `translateY(${top.toFixed(1)}px) scaleY(${Math.max(1, bottom - top).toFixed(1)})`;
    bar.hidden = false;
  }

  // ---------- the panel's bar: title, dots, count, controls
  const chip = $('#scene-chip')!;
  const title = $('#scene-title')!;
  const count = $('#scene-count')!;
  const prev = $<HTMLButtonElement>('#scene-prev')!;
  const next = $<HTMLButtonElement>('#scene-next')!;
  const play = $<HTMLButtonElement>('#scene-play')!;
  const speedButton = $<HTMLButtonElement>('#scene-speed')!;
  const fold = $<HTMLButtonElement>('#scene-fold');
  const dots = $('#scene-dots')!;
  scenes.forEach((scene, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('aria-label', fill(ui.dot, { n: i + 1, title: scene.title[lang] }));
    dot.title = scene.title[lang];
    dot.addEventListener('click', () => goTo(i));
    dots.append(dot);
  });

  let current = 0;
  let speed: Speed = isSpeed(store.get(SCENE_SPEED_KEY))
    ? (store.get(SCENE_SPEED_KEY) as Speed)
    : 'normal';
  let run = new Run({ instant: true, rate: rateOf(speed) });
  run.done = true;
  let state = Object.assign({}, lesson.initial) as S;

  function setPlay(mode: 'playing' | 'paused' | 'ended'): void {
    const label = { playing: ui.pause, paused: ui.resume, ended: ui.replay }[mode];
    play.dataset.state = mode;
    play.setAttribute('aria-label', label);
    play.title = label;
    play.disabled = reduced.matches;
    // A finished scene is a still picture: its CSS loops (a spinner, a caret) stop too, since there
    // is no pause button for them any more (WCAG 2.2.2).
    stage.root.classList.toggle('is-still', mode === 'ended');
  }
  function setSpeedButton(): void {
    const name = ui.speeds[speed];
    speedButton.querySelector('span')!.textContent = name;
    speedButton.setAttribute('aria-label', fill(ui.speed, { speed: name }));
    speedButton.title = fill(ui.speed, { speed: name });
    speedButton.disabled = reduced.matches;
  }
  setSpeedButton();

  function chrome(i: number): void {
    const scene = scenes[i]!;
    chip.textContent = scene.chip[lang];
    chip.dataset.kind = scene.kind;
    title.textContent = scene.title[lang];
    count.textContent = `${i + 1}/${scenes.length}`;
    prev.disabled = i === 0;
    next.disabled = i === scenes.length - 1;
    [...dots.children].forEach((dot, j) => {
      dot.classList.toggle('is-past', j < i);
      if (j === i) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    });
    for (const group of panel.querySelectorAll<HTMLElement>('[data-option]')) {
      const hide = !scene.options?.includes(group.dataset.option ?? '');
      // A control that disappears with the focus in it leaves the focus in the panel, not lost.
      if (hide && group.contains(document.activeElement)) play.focus({ preventScroll: true });
      group.hidden = hide;
    }
    placeBar();
  }

  // ---------- playing a scene
  const viewActors = (view: string) =>
    new Set(lesson.worlds.flatMap((world) => world.views[view] ?? []));
  const zoomOf = (view: string) =>
    Math.max(...lesson.worlds.map((world) => world.zoom?.[view] ?? 0)) || 1.5;
  const folded = () => root.hasAttribute('data-scene-folded') && stacked();

  async function enter(i: number, o: { instant?: boolean; still?: boolean } = {}): Promise<void> {
    const scene = scenes[i];
    if (!scene) return;
    run.cancel();
    const instant = !!o.instant || reduced.matches || folded();
    const r = (run = new Run({ instant, rate: rateOf(speed) }));
    current = i;
    chrome(i);
    stage.clearFx();
    captions.reset();
    stage.root.classList.remove('is-paused');
    setPlay(instant ? 'ended' : 'playing');
    for (const world of lesson.worlds) world.reset(stage.board);
    state = Object.assign({}, lesson.initial, scene.start(options)) as S;
    const redraw = () => {
      for (const world of lesson.worlds) world.apply?.(stage.board, state, lang);
      instrument?.apply(state);
    };
    redraw();
    const d = makeDirector({
      stage,
      run: r,
      lang,
      state,
      worlds: lesson.worlds,
      captions,
      instrument,
    });
    try {
      await stage.setView(scene.view, viewActors(scene.view), r, !o.still, zoomOf(scene.view));
      r.guard();
      stage.sizeWires();
      for (const world of lesson.worlds) world.wires?.(d);
      await scene.play(d);
      r.guard();
      Object.assign(state as object, lesson.initial, scene.end(options));
      redraw();
      stage.links.replaceChildren();
      for (const world of lesson.worlds) world.wires?.(d);
      r.done = true;
      setPlay('ended');
    } catch (error) {
      if (error instanceof Cancel) return;
      console.error(error);
      // A scene that broke halfway is over: the button offers to play it again.
      if (run === r) {
        r.done = true;
        setPlay('ended');
      }
    }
  }

  // ---------- scrolling the text drives the scenes
  const stacked = () => panel.getBoundingClientRect().right > main.getBoundingClientRect().left + 1;
  const line = () =>
    readingLine(innerHeight, stacked() ? panel.getBoundingClientRect().bottom : null);
  const isEnded = (y: number) => !!end && anchor(end).getBoundingClientRect().top <= y;
  /** The part being read: past <Scene end />, the last one. */
  const partAt = (y: number) =>
    isEnded(y)
      ? scenes.length - 1
      : activeCue(
          cues.map((cue) => anchor(cue).getBoundingClientRect().top),
          y,
        );
  let pending = 0;
  let startTimer = 0;
  let lockUntil = 0;
  let ticking = false;
  let resizing = false;

  function onScroll(): void {
    ticking = false;
    if (resizing || performance.now() < lockUntil) return;
    const y = line();
    const wasEnded = ended;
    ended = isEnded(y);
    if (ended !== wasEnded) placeBar();
    const i = partAt(y);
    pending = i;
    clearTimeout(startTimer);
    if (i === current) return;
    // Past <Scene end />, the panel shows the last scene at its final frame (if the reader was
    // watching it, it goes on playing: then i === current). The new scene starts once the reader
    // has stopped scrolling for 160 ms.
    const instant = ended;
    startTimer = window.setTimeout(() => {
      if (pending === i && i !== current) void enter(i, { instant });
    }, 160);
  }
  // Safari (WebKit) scrolls the page to reveal a control of the scene's bar when the Tab key
  // focuses it, although the bar is sticky and already in view (it takes the page's
  // scroll-padding-top, Starlight's room for the header, as covering it), sometimes a quarter of a
  // second later. That scroll would move the reading line and change the scene, so a small scroll
  // soon after such a focus is undone, unless the reader did something meanwhile.
  let steady = scrollY;
  let tabbedAt = -Infinity;
  let focusGuard = 0;
  const unguard = () => {
    focusGuard = 0;
  };
  addEventListener('keydown', (event) => {
    if (event.key === 'Tab') tabbedAt = performance.now();
    else if (event.key !== 'Shift') unguard();
  });
  for (const type of ['wheel', 'touchstart', 'pointerdown'])
    addEventListener(type, unguard, { passive: true });
  panel.addEventListener('focusin', () => {
    if (performance.now() - tabbedAt < 100) focusGuard = performance.now() + 500;
  });
  addEventListener(
    'scroll',
    () => {
      if (
        performance.now() < focusGuard &&
        panel.contains(document.activeElement) &&
        Math.abs(scrollY - steady) < 64
      ) {
        unguard();
        scrollTo(0, steady);
        return;
      }
      steady = scrollY;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    },
    { passive: true },
  );

  function goTo(i: number): void {
    unguard();
    i = Math.max(0, Math.min(scenes.length - 1, i));
    const top =
      i === 0
        ? 0
        : Math.max(0, scrollY + anchor(cues[i]!).getBoundingClientRect().top - line() + 24);
    const ms = reduced.matches ? 80 : 1000;
    lockUntil = performance.now() + ms;
    pending = i;
    ended = false;
    clearTimeout(startTimer);
    scrollTo({ top, behavior: reduced.matches ? 'auto' : 'smooth' });
    if (i !== current || run.cancelled) void enter(i);
    window.setTimeout(onScroll, ms + 60);
  }

  prev.addEventListener('click', () => goTo(current - 1));
  next.addEventListener('click', () => goTo(current + 1));
  play.addEventListener('click', () => {
    if (run.done || run.instant || run.cancelled) void enter(current, { still: true });
    else {
      run.setPaused(!run.paused);
      stage.root.classList.toggle('is-paused', run.paused);
      setPlay(run.paused ? 'paused' : 'playing');
    }
  });
  speedButton.addEventListener('click', () => {
    speed = nextSpeed(speed);
    store.set(SCENE_SPEED_KEY, speed);
    run.setRate(rateOf(speed));
    setSpeedButton();
  });
  // ← and → move between scenes when nothing else wants them: the focus is on the page or in the
  // scene bar (not in the line, a form control or a link), the reader is among the scene parts,
  // and they did not just click into something that scrolls sideways (a table, a diagram), which
  // the arrows scroll.
  let scroller: Element | null = null;
  addEventListener(
    'pointerdown',
    (event) => {
      scroller = null;
      for (let el = event.target as Element | null; el && el !== content; el = el.parentElement) {
        if (
          el.scrollWidth > el.clientWidth + 1 &&
          /auto|scroll/.test(getComputedStyle(el).overflowX)
        ) {
          scroller = el;
          break;
        }
      }
    },
    { passive: true },
  );
  addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const focus = document.activeElement;
    const onPage = !focus || focus === document.body;
    const inBar = !!focus?.closest('.scene-bar') && !focus.matches('[role="separator"]');
    if (!(onPage && !scroller) && !inBar) return;
    if (ended) return;
    const target = current + (event.key === 'ArrowRight' ? 1 : -1);
    if (target < 0 || target >= scenes.length) return;
    event.preventDefault();
    goTo(target);
  });
  for (const group of panel.querySelectorAll<HTMLElement>('[data-option]')) {
    for (const button of group.querySelectorAll<HTMLButtonElement>('button[data-value]')) {
      button.addEventListener('click', () => {
        options[group.dataset.option!] = button.dataset.value!;
        group
          .querySelectorAll('button[data-value]')
          .forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        void enter(current, { still: true });
      });
    }
  }

  // ---------- a new stage size redraws the current scene at its end
  let started = false;
  let measured = { w: 0, h: 0 };
  async function redrawStill(): Promise<void> {
    measured = stage.size();
    await enter(current, { instant: true });
  }
  let resizeTimer = 0;
  let replaceQueued = false;
  new ResizeObserver(() => {
    const size = stage.size();
    // Before the first scene (the fonts) and while hidden (folded) there is nothing to redraw.
    if (!started || size.w === 0 || size.h === 0) {
      measured = size;
      return;
    }
    if (resizing) {
      // While the line moves, the actors only slide to their new places; the rest comes back after.
      if (!replaceQueued) {
        replaceQueued = true;
        requestAnimationFrame(() => {
          replaceQueued = false;
          const scene = scenes[current]!;
          void stage
            .setView(scene.view, viewActors(scene.view), run, false, zoomOf(scene.view))
            .catch(() => {});
        });
      }
      return;
    }
    // A stage that was hidden and shows again (the window turned, the explorer opened) is redrawn.
    if (measured.w > 0 && smallResize(measured, size)) return;
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => void redrawStill(), 160);
  }).observe(stage.root);

  // ---------- folding the scene on a phone
  if (fold) {
    const setFold = (on: boolean) => {
      root.toggleAttribute('data-scene-folded', on);
      fold.setAttribute('aria-expanded', String(!on));
      const label = on ? ui.unfold : ui.fold;
      fold.setAttribute('aria-label', label);
      fold.title = label;
    };
    // TwoColumnContent.astro's inline script already folded it before the first paint.
    setFold(root.hasAttribute('data-scene-folded'));
    fold.addEventListener('click', () => {
      const on = !root.hasAttribute('data-scene-folded');
      setFold(on);
      store.set(SCENE_FOLD_KEY, on ? 'folded' : 'open');
      if (!on) {
        // The stage is back: its new size is already known, so the observer does not cut the scene.
        measured = stage.size();
        void enter(current, { still: true });
      }
    });
  }

  // ---------- the line between the scene and the text
  const sash = $('.scene-sash')!;
  if (!main.id) main.id = 'scene-text';
  sash.setAttribute('aria-controls', main.id);
  let wanted: number | null = Number(store.get(SCENE_SPLIT_KEY)) || null;
  const rem = () => parseFloat(getComputedStyle(root).fontSize) || 16;
  const limits = () => splitLimits(pane.clientWidth, rem());
  function syncSash(): void {
    const values = splitValues(main.getBoundingClientRect().width, pane.clientWidth, limits());
    sash.setAttribute('aria-valuenow', String(values.now));
    sash.setAttribute('aria-valuemin', String(values.min));
    sash.setAttribute('aria-valuemax', String(values.max));
    sash.setAttribute(
      'aria-valuetext',
      fill(ui.splitValue, { text: values.now, scene: values.scene }),
    );
  }
  /** The text block being read stays at the same height while the text reflows, so the scene does not change. */
  let kept: { el: HTMLElement; top: number } | null = null;
  function keepReading(): void {
    const y = line();
    let at: HTMLElement | null = null;
    for (const block of content.children) {
      if (!(block instanceof HTMLElement) || block.hidden) continue;
      if (block.getBoundingClientRect().top <= y) at = block;
      else break;
    }
    kept = at ? { el: at, top: at.getBoundingClientRect().top } : null;
  }
  /** The width goes on the root, as the inline script does; the CSS keeps it within the limits. */
  function applyWidth(): void {
    if (wanted === null) root.style.removeProperty('--scene-text-w');
    else root.style.setProperty('--scene-text-w', `${Math.round(wanted)}px`);
    syncSash();
    if (resizing && kept) {
      const moved = kept.el.getBoundingClientRect().top - kept.top;
      if (Math.abs(moved) > 0.5) scrollBy(0, moved);
    }
  }
  function remember(): void {
    store.set(SCENE_SPLIT_KEY, wanted === null ? '' : String(Math.round(wanted)));
  }
  function startResize(): void {
    if (!resizing) keepReading();
    resizing = true;
    root.classList.add('is-scene-resizing');
  }
  let settle = 0;
  async function endResize(): Promise<void> {
    if (!resizing) return;
    resizing = false;
    clearTimeout(settle);
    await redrawStill();
    if (!resizing) root.classList.remove('is-scene-resizing');
    placeBar();
    onScroll();
  }
  /** Sets the width in one step (keys, a click) and redraws the scene once it settles. */
  function stepTo(width: number | null, settleMs: number): void {
    startResize();
    wanted = width;
    remember();
    applyWidth();
    clearTimeout(settle);
    settle = window.setTimeout(() => void endResize(), settleMs);
  }
  let drag: { id: number; x: number; moved: boolean } | null = null;
  sash.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    sash.focus({ preventScroll: true });
    sash.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX, moved: false };
  });
  sash.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.abs(event.clientX - drag.x) < 3) return;
      drag.moved = true;
      startResize();
    }
    wanted = clampText(pane.getBoundingClientRect().right - event.clientX, limits());
    applyWidth();
  });
  const stopDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    if (moved) {
      remember();
      void endResize();
      return;
    }
    // A click without dragging (WCAG 2.5.7, a single pointer is enough) goes through three widths:
    // the default, the widest text and the narrowest.
    const bounds = limits();
    const widest = wanted !== null && wanted >= bounds.max - 1;
    stepTo(wanted === null ? bounds.max : widest ? bounds.min : null, 60);
  };
  sash.addEventListener('pointerup', stopDrag);
  sash.addEventListener('pointercancel', stopDrag);
  sash.addEventListener('lostpointercapture', stopDrag);
  sash.addEventListener('keydown', (event) => {
    const width = main.getBoundingClientRect().width;
    const step = event.shiftKey ? 96 : 24;
    const bounds = limits();
    const target =
      event.key === 'ArrowLeft'
        ? width + step
        : event.key === 'ArrowRight'
          ? width - step
          : event.key === 'Home'
            ? bounds.min
            : event.key === 'End'
              ? bounds.max
              : null;
    if (target === null) return;
    event.preventDefault();
    event.stopPropagation();
    stepTo(clampText(target, bounds), 250);
  });
  // The pane changes width with the window and with the explorer (which fires no resize): the CSS
  // keeps the text within its limits, and the line's values and the part's highlight follow.
  new ResizeObserver(() => {
    syncSash();
    placeBar();
  }).observe(pane);
  applyWidth();

  // ---------- the reader asks for less motion, or no longer does, while reading
  reduced.addEventListener('change', () => {
    setSpeedButton();
    void enter(current, { instant: true });
  });

  // ---------- the first frame at once, the first scene once the fonts are in
  const y0 = line();
  ended = isEnded(y0);
  const first = partAt(y0);
  current = first;
  pending = first;
  chrome(first);
  const firstScene = scenes[first]!;
  state = Object.assign({}, lesson.initial, firstScene.start(options)) as S;
  for (const world of lesson.worlds) world.reset(stage.board);
  for (const world of lesson.worlds) world.apply?.(stage.board, state, lang);
  instrument?.apply(state);
  void stage.setView(
    firstScene.view,
    viewActors(firstScene.view),
    run,
    false,
    zoomOf(firstScene.view),
  );
  const fontsIn = document.fonts
    ? Promise.all(FONTS.map((font) => document.fonts.load(font).catch(() => null)))
    : Promise.resolve();
  void Promise.race([fontsIn, new Promise((resolve) => setTimeout(resolve, 2500))]).then(() => {
    started = true;
    measured = stage.size();
    // A reader who arrives past <Scene end /> (a link to the quiz) sees the last scene's final frame.
    void enter(current, ended ? { instant: true } : { still: true });
  });
}
