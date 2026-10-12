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
});

describe('toggledExplorer', () => {
  it('stores the opposite of the current state', () => {
    expect(toggledExplorer(false)).toBe('collapsed');
    expect(toggledExplorer(true)).toBe('shown');
  });
});
