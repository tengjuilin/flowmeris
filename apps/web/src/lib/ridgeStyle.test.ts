import type { Group, RidgeLayout } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVERLAP,
  DEFAULT_RIDGE_STYLE,
  applyRidgeToChannels,
  applyRidgeToPopulations,
  carryRidge,
  resetRidgeChannel,
  resetRidgeLayout,
  ridgeAtDefaults,
  ridgeChannelAtDefaults,
  ridgeChannelsMatch,
  ridgePopulationsMatch,
  setRidgeChannelStyles,
  withRidgeChannel,
} from './ridgeStyle.ts';

const ridge = (id: string, color = '#111111', ch = 'A') =>
  ({
    kind: 'ridge',
    id,
    population: id,
    axis: { channel: ch },
    overlap: DEFAULT_OVERLAP,
    norm: 'mode',
    style: { ...structuredClone(DEFAULT_RIDGE_STYLE), color },
  }) as unknown as RidgeLayout;
const setCh = (l: RidgeLayout, ch: string) =>
  withRidgeChannel(l, () => void (l.axis = { ...l.axis, channel: ch }));

describe('carrying and applying ridge settings across populations', () => {
  it('carries settings to the population opened next, keeping its ticks and axis title', () => {
    const a = ridge('a', '#222222');
    a.overlap = 0.3;
    const b = ridge('b');
    b.style.axisTitle = 'B';
    expect(carryRidge(a, b)).toBe(true);
    expect(b.style.color).toBe('#222222');
    expect(b.overlap).toBe(0.3);
    expect(b.style.axisTitle).toBe('B');
    expect(carryRidge(a, b)).toBe(false);
  });

  it('applies to every population now', () => {
    const g = { layouts: [ridge('a', '#222222'), ridge('b'), ridge('c')] } as unknown as Group;
    expect(ridgePopulationsMatch(g, 'a')).toBe(false);
    applyRidgeToPopulations(g, 'a');
    expect(ridgePopulationsMatch(g, 'a')).toBe(true);
  });
});

describe('ridge settings per axis channel', () => {
  it('carries the settings in use to the next channel while carrying is on', () => {
    const l = ridge('l', '#222222');
    expect(setCh(l, 'B')).toBe(false);
    expect(l.style.color).toBe('#222222');
    expect(l.stylesByChannel?.A?.style.color).toBe('#222222');
  });

  it('restores each channel’s own settings while carrying is off; unused ones start at the defaults', () => {
    const l = ridge('l', '#222222');
    setRidgeChannelStyles(l, true);
    setCh(l, 'B');
    expect(l.style.color).toBe(DEFAULT_RIDGE_STYLE.color);
    l.style.color = '#333333';
    expect(setCh(l, 'A')).toBe(true);
    expect(l.style.color).toBe('#222222');
    setCh(l, 'B');
    expect(l.style.color).toBe('#333333');
  });

  it('applies to every channel now, including unused ones', () => {
    const l = ridge('l', '#222222');
    setRidgeChannelStyles(l, true);
    setCh(l, 'B');
    l.style.color = '#333333';
    expect(ridgeChannelsMatch(l)).toBe(false);
    applyRidgeToChannels(l);
    expect(ridgeChannelsMatch(l)).toBe(true);
    setCh(l, 'A');
    expect(l.style.color).toBe('#333333');
    setCh(l, 'C');
    expect(l.style.color).toBe('#333333');
  });

  it('resets one channel in every population and leaves the others', () => {
    const a = ridge('a', '#222222');
    const b = ridge('b', '#444444', 'B');
    setRidgeChannelStyles(b, true);
    b.stylesByChannel = {
      A: { style: { ...structuredClone(DEFAULT_RIDGE_STYLE), color: '#555555' }, overlap: 0.6 },
    };
    const g = { layouts: [a, b] } as unknown as Group;
    resetRidgeChannel(g, 'A');
    expect(a.style.color).toBe(DEFAULT_RIDGE_STYLE.color);
    expect(b.style.color).toBe('#444444');
    expect(b.stylesByChannel.A?.style.color).toBe(DEFAULT_RIDGE_STYLE.color);
    expect(ridgeChannelAtDefaults(g, 'A')).toBe(true);
    expect(ridgeAtDefaults(b)).toBe(false);
    resetRidgeLayout(b);
    expect(ridgeAtDefaults(b)).toBe(true);
  });
});
