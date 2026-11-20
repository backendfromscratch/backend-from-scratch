import { describe, expect, it } from 'vitest';
import { explorerCollapsed, toggledExplorer } from './explorer-panel';

describe('explorerCollapsed', () => {
  it('hides the panel only if the reader hid it', () => {
    expect(explorerCollapsed('collapsed')).toBe(true);
    expect(explorerCollapsed('shown')).toBe(false);
  });

  it('shows it with nothing stored or something unknown (private browsing, an old value)', () => {
    expect(explorerCollapsed(null)).toBe(false);
    expect(explorerCollapsed('')).toBe(false);
    expect(explorerCollapsed('true')).toBe(false);
  });

  it('starts it folded on a scene lesson in a window under 75rem, unless the reader chose', () => {
    expect(explorerCollapsed(null, true, false)).toBe(true);
    expect(explorerCollapsed('shown', true, false)).toBe(false);
    expect(explorerCollapsed(null, true, true)).toBe(false);
    expect(explorerCollapsed(null, false, false)).toBe(false);
  });
});

describe('toggledExplorer', () => {
  it('stores the opposite of the current state', () => {
    expect(toggledExplorer(false)).toBe('collapsed');
    expect(toggledExplorer(true)).toBe('shown');
  });
});
