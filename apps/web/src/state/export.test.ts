import { newGroup, newWorkspace } from '@flowmeris/model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ComputePool, setPool } from '../engine-client/pool.ts';
import { plotSource } from './export.ts';
import { APP_INFO, useStore } from './store.ts';

const S = useStore.getState;
const plot = { id: 'p1', x: { channel: 'FSC-A', transform: 'tx' } } as never;

/** A group with samples a and b, b selected, and a pool that records which sample each raster draws. */
function setup() {
  const ws = newWorkspace('test', APP_INFO);
  const g = newGroup('One', ['a', 'b'], ['FSC-A']);
  ws.groups.push(g);
  ws.samples.a = { sha256: 'hash-a' } as never;
  ws.samples.b = { sha256: 'hash-b' } as never;
  S().setWorkspace(ws);
  S().setUi({ groupId: g.id, sampleId: 'b' });
  const raster = vi.fn(async (_ctx: unknown, _req: { sampleId: string }) => ({}) as never);
  setPool({ raster } as unknown as ComputePool);
  return raster;
}

afterEach(() => setPool(undefined));

describe('plotSource', () => {
  it('draws and records the selected sample by default', async () => {
    const raster = setup();
    const src = plotSource(plot);
    await src.raster(plot, 10, 10);
    expect(raster.mock.calls[0]![1]).toMatchObject({ sampleId: 'b' });
    expect(src.sha256).toBe('hash-b');
  });

  it("draws and records the sample it is given (a grid cell's own sample)", async () => {
    const raster = setup();
    const src = plotSource(plot, 'a');
    await src.raster(plot, 10, 10);
    expect(raster.mock.calls[0]![1]).toMatchObject({ sampleId: 'a' });
    expect(src.sha256).toBe('hash-a');
  });

  it("records the hash of the group's first sample when it draws that one", async () => {
    setup();
    S().setUi({ sampleId: null });
    expect(plotSource(plot).sha256).toBe('hash-a');
  });
});
