import { type Population, newGroup } from '@flowmeris/model';
import { describe, expect, it } from 'vitest';
import { basisChoices, defaultBasis } from './statBasis.ts';

const pop = (id: string, parent: string): Population => ({
  id,
  parent,
  gate: 'g',
  region: 'in',
  name: id,
  color: '#000000',
});

function template() {
  const t = newGroup('G', [], ['FSC-A']).template;
  t.populations.a = pop('a', 'root');
  t.populations.b = pop('b', 'a');
  t.populations.c = pop('c', 'b');
  return t;
}

describe('% of population basis', () => {
  it('offers the ancestors from the root down, not the population itself', () => {
    expect(basisChoices(template(), 'c').map((p) => p.id)).toEqual(['root', 'a', 'b']);
    expect(basisChoices(template(), 'a').map((p) => p.id)).toEqual(['root']);
  });

  it('offers nothing for the root or an unknown population', () => {
    expect(basisChoices(template(), 'root')).toEqual([]);
    expect(basisChoices(template(), 'nope')).toEqual([]);
  });

  it('starts at the parent', () => {
    expect(defaultBasis(template(), 'c')).toBe('b');
    expect(defaultBasis(template(), 'root')).toBeUndefined();
    expect(defaultBasis(template(), 'nope')).toBeUndefined();
  });
});
