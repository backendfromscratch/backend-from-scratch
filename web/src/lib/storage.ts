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
