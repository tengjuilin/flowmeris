import { describe, expect, it } from 'vitest';
import { saveStatusText } from './saveStatus.ts';

const time = (ms: number) => `t${ms}`;

describe('saveStatusText', () => {
  it('names each state', () => {
    expect(saveStatusText({ state: 'unsaved', at: 5 }, time).label).toBe('Unsaved');
    expect(saveStatusText({ state: 'saving', at: 5 }, time).label).toBe('Saving…');
    expect(saveStatusText({ state: 'saved', at: 5 }, time).label).toBe('Saved');
    expect(saveStatusText({ state: 'failed', at: 5 }, time).label).toBe('Not saved');
  });

  it('gives the time of the last save, and the error of a failed one', () => {
    expect(saveStatusText({ state: 'saved', at: 5 }, time).title).toMatch(/^Saved in this browser at t5\./);
    expect(saveStatusText({ state: 'saved', at: null }, time).title).toMatch(/^Saved in this browser\./);
    expect(saveStatusText({ state: 'failed', at: 5, error: 'QuotaExceededError' }, time).title).toMatch(
      /failed: QuotaExceededError\. .*Export/,
    );
  });
});
