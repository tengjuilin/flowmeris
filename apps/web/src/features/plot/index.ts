// The plot: PlotCanvas draws one plot with its gates and edits them; the controls pick its type,
// channels and scales, and the gate drawing tool.
export { PlotCanvas } from './PlotCanvas.tsx';
// Margins and plot area of a PlotCanvas drawn in a given space, for callers that size one.
export { plotBox } from '../../lib/plotLayout.ts';
export { AxisSelects, EditScopeToggle, PlotKindSelect, ToolButtons } from './PlotControls.tsx';
export { usePlotForPopulation, useTilePlot } from './usePlot.ts';
