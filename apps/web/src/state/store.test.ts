import { type Workspace, newGroup, newWorkspace } from '@flowmeris/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_INFO, timestampName, useStore } from './store.ts';

const S = useStore.getState;

/** A workspace with two groups: g1 (samples a, b) and g2 (sample c). */
function workspace(): Workspace {
  const ws = newWorkspace('test', APP_INFO);
  const g1 = newGroup('One', ['a', 'b'], ['FSC-A']);
  const g2 = newGroup('Two', ['c'], ['FSC-A']);
  g1.plots.push({ id: 'p1' } as never);
  ws.groups.push(g1, g2);
  return ws;
}

const view = () => S().ui.view;
const ids = () => {
  const ws = S().ws;
  return { g1: ws.groups[0]!.id, g2: ws.groups[1]!.id };
};

beforeEach(() => {
  S().setWorkspace(workspace());
  S().setUi({ view: 'gate' });
  useStore.setState({ nav: { back: [], forward: [] } });
});

describe('Back and Forward between tabs', () => {
  it('records tab switches, not changes within a tab', () => {
    S().setUi({ view: 'plot' });
    S().setUi({ sampleId: 'b', popId: 'x' });
    S().setUi({ view: 'stats' });
    expect(S().nav.back.map((l) => l.view)).toEqual(['gate', 'plot']);
    expect(S().nav.back[1]).toMatchObject({ view: 'plot', sampleId: 'b', popId: 'x' });
  });

  it('returns to the tab, sample and population left, and Forward undoes it', () => {
    const { g1 } = ids();
    S().setUi({ sampleId: 'b', popId: 'pop1' });
    S().setUi({ view: 'tiles', sampleId: 'a', popId: 'root' });
    S().navigate(-1);
    expect(S().ui).toMatchObject({ view: 'gate', groupId: g1, sampleId: 'b', popId: 'pop1' });
    expect(S().nav.back).toEqual([]);
    expect(S().nav.forward.map((l) => l.view)).toEqual(['tiles']);
    S().navigate(1);
    expect(S().ui).toMatchObject({ view: 'tiles', sampleId: 'a', popId: 'root' });
    expect(S().nav.forward).toEqual([]);
    expect(S().nav.back.map((l) => l.view)).toEqual(['gate']);
  });

  it('walks several steps back and forward in order', () => {
    for (const v of ['plot', 'tiles', 'stats'] as const) S().setUi({ view: v });
    S().navigate(-1);
    S().navigate(-1);
    S().navigate(-1);
    expect(view()).toBe('gate');
    S().navigate(-1); // nothing further back
    expect(view()).toBe('gate');
    S().navigate(1);
    S().navigate(1);
    expect(view()).toBe('tiles');
  });

  it('a new tab switch after Back clears Forward', () => {
    S().setUi({ view: 'plot' });
    S().navigate(-1);
    expect(S().nav.forward).toHaveLength(1);
    S().setUi({ view: 'charts' });
    expect(S().nav.forward).toEqual([]);
    S().navigate(1);
    expect(view()).toBe('charts');
  });

  it('clears the selected gate on a move', () => {
    S().setUi({ view: 'plot' });
    S().setUi({ selectedGateId: 'gate1' });
    S().navigate(-1);
    expect(S().ui.selectedGateId).toBeNull();
  });

  it('falls back to what still exists when a sample, plot or group was removed', () => {
    const { g1, g2 } = ids();
    S().setUi({ sampleId: 'b', plotId: 'p1' });
    S().setUi({ view: 'plot' });
    S().mutate('remove b and p1', (ws) => {
      ws.groups[0]!.sampleIds = ['a'];
      ws.groups[0]!.plots = [];
    });
    S().navigate(-1);
    expect(S().ui).toMatchObject({ view: 'gate', groupId: g1, sampleId: 'a', plotId: null });

    S().setUi({ groupId: g2, sampleId: 'c' });
    S().setUi({ view: 'stats' });
    S().setUi({ groupId: g1, sampleId: 'a' });
    S().mutate('remove g2', (ws) => {
      ws.groups.splice(1, 1);
    });
    S().navigate(-1);
    // The group left from is gone: only the tab changes.
    expect(S().ui).toMatchObject({ view: 'gate', groupId: g1, sampleId: 'a' });
  });

  it('keeps the last 100 steps', () => {
    for (let i = 0; i < 120; i++) S().setUi({ view: i % 2 ? 'gate' : 'plot' });
    expect(S().nav.back).toHaveLength(100);
  });

  it('opening another workspace clears the history', () => {
    S().setUi({ view: 'plot' });
    S().setWorkspace(workspace());
    expect(S().nav).toEqual({ back: [], forward: [] });
  });
});

describe('undo history', () => {
  const rename = (name: string, merge?: string) =>
    S().mutate(
      'Rename',
      (ws) => {
        ws.name = name;
      },
      merge,
    );

  it('undoes and redoes a change, and a new change clears redo', () => {
    rename('A');
    rename('B');
    S().undo();
    expect(S().ws.name).toBe('A');
    S().redo();
    expect(S().ws.name).toBe('B');
    S().undo();
    rename('C');
    expect(S().future).toEqual([]);
    S().undo();
    S().undo();
    expect(S().ws.name).toBe('test');
    S().undo(); // nothing left
    expect(S().ws.name).toBe('test');
  });

  it('a change that changes nothing adds no step, even in a later millisecond', () => {
    vi.useFakeTimers({ now: Date.parse(S().ws.modifiedAt) + 5000, toFake: ['Date'] });
    try {
      const ws = S().ws;
      rename('test');
      expect(S().past).toEqual([]);
      expect(S().ws).toBe(ws);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a change stamps the modification time, and undo restores it', () => {
    const was = S().ws.modifiedAt;
    vi.useFakeTimers({ now: Date.parse(was) + 5000, toFake: ['Date'] });
    try {
      rename('A');
      expect(S().ws.modifiedAt).toBe(new Date(Date.parse(was) + 5000).toISOString());
      S().undo();
      expect(S().ws.modifiedAt).toBe(was);
    } finally {
      vi.useRealTimers();
    }
  });

  it('merges changes with the same key less than a second apart into one step', () => {
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValue(10_000);
      rename('x', 'typing');
      now.mockReturnValue(10_500);
      rename('xy', 'typing');
      now.mockReturnValue(10_900);
      rename('xyz', 'typing');
      expect(S().past).toHaveLength(1);
      now.mockReturnValue(12_000); // more than a second after the last
      rename('xyz!', 'typing');
      now.mockReturnValue(12_100);
      rename('other', 'slider'); // another key
      expect(S().past).toHaveLength(3);
      S().undo();
      S().undo();
      expect(S().ws.name).toBe('xyz');
      S().undo();
      expect(S().ws.name).toBe('test');
    } finally {
      now.mockRestore();
    }
  });

  it('quiet changes add no undo step', () => {
    S().mutateQuiet((ws) => {
      ws.name = 'quiet';
    });
    expect(S().ws.name).toBe('quiet');
    expect(S().past).toEqual([]);
  });

  it('opening a workspace selects its first group and sample and clears undo', () => {
    rename('A');
    S().setUi({ excluded: { a: true }, popId: 'x' });
    const ws = workspace();
    S().setWorkspace(ws);
    expect(S().past).toEqual([]);
    expect(S().ui).toMatchObject({
      groupId: ws.groups[0]!.id,
      sampleId: 'a',
      popId: 'root',
      plotId: null,
      excluded: {},
    });
  });
});

describe('default workspace name', () => {
  it('is the local date and time, ISO 8601 to the second', () => {
    expect(timestampName(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02T03:04:05');
    expect(timestampName(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31T23:59:59');
  });
});
