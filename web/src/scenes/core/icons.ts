/** Small icons the scenes put inside packets and labels or move across the stage. Decorative. */

export const icons = {
  lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.6 7V5.2a3.4 3.4 0 0 1 6.8 0V7" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="7" width="10" height="7.6" rx="1.8" fill="currentColor"/></svg>',
  key: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="8" r="3.1" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.1 8h6.3M12.2 8v2.7M14.3 8v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  hammer:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="scene-hammer__handle" d="M5 20 L13.5 11.5"/><path class="scene-hammer__head" d="M11 6.5 L17.5 13 L20.5 10 L14 3.5 Z"/></svg>',
  van: '<svg viewBox="0 0 100 52" aria-hidden="true"><path class="scene-van__body" d="M34 8 H94 a4 4 0 0 1 4 4 V40 H34 Z"/><path class="scene-van__cab" d="M34 16 H18 L6 28 V40 H34 Z"/><path class="scene-van__window" d="M30 19 H19 L11 28 H30 Z"/><rect class="scene-van__logo" x="52" y="16" width="30" height="15" rx="2"/><circle class="scene-van__wheel" cx="22" cy="42" r="7.5"/><circle class="scene-van__wheel" cx="80" cy="42" r="7.5"/></svg>',
} as const;

export type IconName = keyof typeof icons;
