import { describe, expect, it } from 'vitest';
import { readPanelState, toggleCard } from './settingsPanel.ts';

const TABS = ['figure', 'axis', 'text'] as const;

describe('settings panel state', () => {
  it('starts on the fallback tab with every card open', () => {
    expect(readPanelState(null, TABS, 'figure')).toEqual({ tab: 'figure', closed: [] });
  });

  it('reads the stored tab and collapsed cards', () => {
    const raw = JSON.stringify({ tab: 'axis', closed: ['size', 'marks'] });
    expect(readPanelState(raw, TABS, 'figure')).toEqual({ tab: 'axis', closed: ['size', 'marks'] });
  });

  it('falls back on an unknown tab or unreadable state', () => {
    expect(readPanelState(JSON.stringify({ tab: 'gone', closed: ['a'] }), TABS, 'figure')).toEqual({
      tab: 'figure',
      closed: ['a'],
    });
    expect(readPanelState('{', TABS, 'text').tab).toBe('text');
    expect(readPanelState('null', TABS, 'text')).toEqual({ tab: 'text', closed: [] });
  });

  it('reads the earlier formats: a bare tab id, and the open cards', () => {
    expect(readPanelState('axis', TABS, 'figure')).toEqual({ tab: 'axis', closed: [] });
    const old = JSON.stringify({ tab: 'text', open: { a: true, b: false, c: false } });
    expect(readPanelState(old, TABS, 'figure')).toEqual({ tab: 'text', closed: ['b', 'c'] });
  });

  it('toggles a card', () => {
    const s = toggleCard({ tab: 'figure' as const, closed: [] }, 'size');
    expect(s.closed).toEqual(['size']);
    expect(toggleCard(s, 'size').closed).toEqual([]);
  });
});
