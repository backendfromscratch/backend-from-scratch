/** Whether the side panel starts hidden: only if the reader hid it; by default it is shown. */
export function explorerCollapsed(stored: string | null): boolean {
  return stored === 'collapsed';
}

/** What is stored after pressing the button: the opposite of the current state. */
export function toggledExplorer(collapsed: boolean): 'collapsed' | 'shown' {
  return collapsed ? 'shown' : 'collapsed';
}
