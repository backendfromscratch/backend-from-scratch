/**
 * Whether the side panel starts hidden: if the reader hid it. On a scene lesson in a window under
 * 75rem, also when the reader has not chosen, because the scene and the text need the room
 * (docs/specs/2026-11-20-visual-lessons-design.md, §2.1). Otherwise it is shown.
 */
export function explorerCollapsed(stored: string | null, scenes = false, wide = true): boolean {
  if (stored === 'collapsed') return true;
  if (stored === 'shown') return false;
  return scenes && !wide;
}

/** What is stored after pressing the button: the opposite of the current state. */
export function toggledExplorer(collapsed: boolean): 'collapsed' | 'shown' {
  return collapsed ? 'shown' : 'collapsed';
}
