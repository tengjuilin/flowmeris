import { describe, expect, it } from 'vitest';
import { Scheduler } from './scheduler.ts';

/** A job the test finishes by hand, counting how often it was started. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const job = {
    started: 0,
    run: () => {
      job.started++;
      return promise;
    },
    resolve,
    reject,
  };
  return job;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('worker request scheduling', () => {
  it('runs at most `inFlight` jobs per worker, the rest in order as others finish', async () => {
    const s = new Scheduler(2, 1, 1e6);
    const [a, b, c] = [deferred<number>(), deferred<number>(), deferred<number>()];
    const pa = s.schedule(0, a.run);
    const pb = s.schedule(0, b.run);
    const pc = s.schedule(1, c.run);
    expect([a.started, b.started, c.started]).toEqual([1, 0, 1]);
    a.resolve(1);
    expect(await pa).toBe(1);
    await tick();
    expect(b.started).toBe(1);
    b.resolve(2);
    c.resolve(3);
    expect(await Promise.all([pb, pc])).toEqual([2, 3]);
  });

  it('shares identical requests and serves the finished result from the cache', async () => {
    const s = new Scheduler(1, 2, 1e6);
    const a = deferred<{ v: number }>();
    const p1 = s.schedule(0, a.run, { key: 'k' });
    const p2 = s.schedule(0, a.run, { key: 'k' });
    a.resolve({ v: 1 });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
    expect(a.started).toBe(1);
    expect(s.cached('k')).toBe(r1);
    expect(await s.schedule(0, a.run, { key: 'k' })).toBe(r1);
    expect(a.started).toBe(1);
  });

  it('drops a queued request every caller aborted, and runs it afresh when asked again', async () => {
    const s = new Scheduler(1, 1, 1e6);
    const first = deferred<number>();
    void s.schedule(0, first.run);
    const queued = deferred<number>();
    const ac = new AbortController();
    const p = s.schedule(0, queued.run, { key: 'q', signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    const again = deferred<number>();
    const p2 = s.schedule(0, again.run, { key: 'q' });
    first.resolve(0);
    await tick();
    expect(queued.started).toBe(0);
    expect(again.started).toBe(1);
    again.resolve(5);
    expect(await p2).toBe(5);
  });

  it('keeps a shared request running while another caller still waits', async () => {
    const s = new Scheduler(1, 1, 1e6);
    const blocker = deferred<number>();
    void s.schedule(0, blocker.run);
    const job = deferred<number>();
    const ac = new AbortController();
    const cancelled = s.schedule(0, job.run, { key: 'j', signal: ac.signal });
    const kept = s.schedule(0, job.run, { key: 'j' });
    ac.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    blocker.resolve(0);
    await tick();
    job.resolve(7);
    expect(await kept).toBe(7);
  });

  it('rejects at once when the signal is already aborted', async () => {
    const s = new Scheduler(1, 1, 1e6);
    const ac = new AbortController();
    ac.abort();
    const job = deferred<number>();
    await expect(s.schedule(0, job.run, { signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(job.started).toBe(0);
  });

  it('evicts the least recently used results beyond its byte budget', async () => {
    const s = new Scheduler(1, 2, 2500); // room for two 1056-byte results
    const result = () => ({ rgba: new Uint8Array(800) });
    for (const k of ['a', 'b']) await s.schedule(0, async () => result(), { key: k });
    s.cached('a'); // a is now the most recently used
    await s.schedule(0, async () => result(), { key: 'c' });
    expect(s.cached('a')).toBeDefined();
    expect(s.cached('b')).toBeUndefined();
    expect(s.cached('c')).toBeDefined();
  });
});
