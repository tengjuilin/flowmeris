import { type GatingTemplate, type Population, populationLineage } from '@flowmeris/model';

/**
 * The populations a "% of population" statistic of `popId` can take its percentage of: its ancestors
 * from the root down, so the result is at most 100%. Empty for the root.
 */
export function basisChoices(template: GatingTemplate, popId: string): Population[] {
  if (!template.populations[popId]) return [];
  return populationLineage(template, popId).slice(0, -1);
}

/** The basis a new "% of population" statistic starts with: the population's parent. */
export function defaultBasis(template: GatingTemplate, popId: string): string | undefined {
  return template.populations[popId]?.parent ?? undefined;
}
