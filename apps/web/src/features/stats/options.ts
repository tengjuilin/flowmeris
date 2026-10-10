import type { AggFunc, StatKind } from '@flowmeris/model';

/** Value statistics the New statistic form offers. */
export const VALUE_STATS: { id: StatKind; label: string }[] = [
  { id: 'median', label: 'Median' },
  { id: 'mean', label: 'Mean' },
  { id: 'geomMean', label: 'Geometric mean (x > 0)' },
  { id: 'sd', label: 'SD' },
  { id: 'cv', label: 'CV (%)' },
  { id: 'rsd', label: 'Robust SD' },
  { id: 'rcv', label: 'Robust CV (%)' },
  { id: 'percentile', label: 'Percentile…' },
  { id: 'min', label: 'Min' },
  { id: 'max', label: 'Max' },
];

/** Replicate summaries of a grouped table. */
export const AGG_FUNCS: { id: AggFunc; label: string; title: string }[] = [
  { id: 'mean', label: 'Mean', title: 'Arithmetic mean' },
  { id: 'sd', label: 'SD', title: 'Sample standard deviation (n − 1)' },
  { id: 'sem', label: 'SEM', title: 'Standard error of the mean, SD / √n' },
  {
    id: 'ci95',
    label: '95% CI',
    title: 'Half-width of the 95% confidence interval of the mean, t(0.975, n − 1) · SEM',
  },
  { id: 'median', label: 'Median', title: 'Median' },
  { id: 'cv', label: 'CV', title: 'Coefficient of variation, 100 · SD / mean (%)' },
  { id: 'min', label: 'Min', title: 'Minimum' },
  { id: 'max', label: 'Max', title: 'Maximum' },
  { id: 'n', label: 'n', title: 'Number of rows in each group' },
];
