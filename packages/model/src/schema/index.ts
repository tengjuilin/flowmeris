/**
 * Flowmeris workspace document, schema version 1.
 *
 * The workspace is plain JSON. Every analysis decision (compensation,
 * transforms, gates, per-sample overrides, plots, statistics) is stored here so
 * that a workspace file plus the original FCS files fully reproduces an
 * analysis. See docs/methods/workspace.md for the format and docs/adr/ for the
 * rationale behind the shape.
 */

export * from './transform.ts';
export * from './compensation.ts';
export * from './sample.ts';
export * from './gate.ts';
export * from './plot.ts';
export * from './figure.ts';
export * from './ridge.ts';
export * from './table.ts';
export * from './chart.ts';
export * from './workspace.ts';
