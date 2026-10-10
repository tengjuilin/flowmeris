import { describe, expect, it } from 'vitest';
import {
  type PanelSpec,
  cardTitle,
  cardsOfTab,
  panelResetLabel,
  readPanelState,
  specProblems,
  tabLabel,
  tabResettable,
  toggleCard,
} from './settingsPanel.ts';

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

describe('settings panel spec checks', () => {
  it('finds repeated ids and an unknown default tab', () => {
    const spec: PanelSpec<string, string> = {
      key: 'k',
      idPrefix: 'p',
      name: 'P',
      noun: 'plot',
      defaultTab: 'gone',
      tabs: [
        { id: 'a', label: 'A', cards: { x: 'X' } },
        { id: 'a', label: 'B', cards: { x: 'X again' } },
      ],
    };
    expect(specProblems(spec)).toEqual([
      'P: a tab id is repeated',
      'P: unknown default tab gone',
      'P: card x is in several tabs',
    ]);
  });

  it('reads tab labels, card titles and the cards of a tab', () => {
    const spec: PanelSpec<string, string> = {
      key: 'k',
      idPrefix: 'p',
      name: 'P',
      noun: 'plot',
      defaultTab: 'a',
      tabs: [{ id: 'a', label: 'Axis', cards: { x: 'X axis', y: 'Y axis' } }],
    };
    expect(tabLabel(spec, 'a')).toBe('Axis');
    expect(cardTitle(spec, 'y')).toBe('Y axis');
    expect(cardTitle(spec, 'z')).toBeUndefined();
    expect(cardsOfTab(spec, 'a')).toEqual(['x', 'y']);
    expect(panelResetLabel(spec, 'a')).toBe('Reset plot axis settings');
    expect(tabResettable(spec, 'a')).toBe(true);
    expect(tabResettable({ ...spec, tabs: [{ ...spec.tabs[0]!, resettable: false }] }, 'a')).toBe(false);
  });
});
