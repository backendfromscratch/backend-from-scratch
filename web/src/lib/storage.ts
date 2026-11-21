/**
 * What the interface remembers in the reader's browser. localStorage may not exist or may throw
 * (private browsing, blocked data, quota full): everything keeps working then, just
 * without remembering anything.
 */

/** 'open' if the reader has opened the OUTLINE (it starts collapsed); empty otherwise. */
export const OUTLINE_KEY = 'ide-outline';

/** The phase folders the reader has opened or collapsed: { «fase-1»: true, … }. */
export const FOLDERS_KEY = 'ide-folders';

/** 'collapsed' if the reader has hidden the side panel (explorer and outline) on a computer. */
export const EXPLORER_KEY = 'ide-explorer';

/** The width of a scene lesson's text column, in px, if the reader moved the line (ScenePanel.astro). */
export const SCENE_SPLIT_KEY = 'ide-scene-split';

/** The scenes' speed: 'slow', 'normal' or 'fast' (src/scenes/core/timing.ts). */
export const SCENE_SPEED_KEY = 'ide-scene-speed';

/** 'folded' if the reader folded the scene into its bar on a phone. */
export const SCENE_FOLD_KEY = 'ide-scene-folded';

export interface SafeStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export function safeStorage(getStorage: () => Pick<Storage, 'getItem' | 'setItem'>): SafeStorage {
  return {
    get(key) {
      try {
        return getStorage().getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        getStorage().setItem(key, value);
      } catch {
        // Without storage, the change only applies to this page.
      }
    },
  };
}
