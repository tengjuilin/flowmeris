import {
  type AxisSpec,
  type Group,
  type PlotKind,
  type PlotSpec,
  type PlotStyle,
  type Sample,
  type Transform,
  type Workspace,
  newId,
  transformId,
} from '@flowmeris/model';
import { CATEGORICAL } from '@flowmeris/render';
import { asinhDefFromCofactor } from '@flowmeris/transforms';

export const DEFAULT_STYLE: PlotStyle = {
  colormap: 'viridis',
  pointPx: 1,
  smoothSigmaBins: 1.5,
  contour: { mode: 'equal-prob', pct: 5 },
  showOutliers: true,
  histBins: 256,
  histNorm: 'mode',
  histSmooth: false,
};

export function registerTransform(ws: Workspace, t: Transform): string {
  const id = transformId(t);
  if (!ws.transforms[id]) ws.transforms[id] = t;
  return id;
}

/** Representative sample metadata for a group (first sample). */
export function groupSample(ws: Workspace, g: Group): Sample | undefined {
  for (const id of g.sampleIds) if (ws.samples[id]) return ws.samples[id];
  return undefined;
}

/**
 * Default axis for a channel (docs/guide/axes.md): scatter channels linear over
 * [0, $PnR] and time channels over [0, $PnR · $TIMESTEP]; fluorescence channels logicle with T = $PnR (min
 * 1024), W = 0.5, M = 4.5, A = 0. All map to display range [0, 1].
 */
export type ScaleKind = 'linear' | 'log' | 'logicle' | 'arcsinh';

export const SCALE_KINDS: { id: ScaleKind; label: string }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'log', label: 'Log10' },
  { id: 'logicle', label: 'Logicle (biexponential)' },
  { id: 'arcsinh', label: 'Arcsinh' },
];

export function scaleKindOf(t: Transform): ScaleKind {
  return t.kind === 'flin'
    ? 'linear'
    : t.kind === 'flog'
      ? 'log'
      : t.kind === 'fasinh'
        ? 'arcsinh'
        : 'logicle';
}

/** Default transform of scale kind `k` with top of scale `top`. */
export function transformOfKind(k: ScaleKind, top: number): Transform {
  if (k === 'linear') return { kind: 'flin', T: top, A: 0 };
  if (k === 'log') return { kind: 'flog', T: top, M: Math.max(1, Math.round(Math.log10(top))) };
  if (k === 'logicle') return { kind: 'logicle', T: top, W: 0.5, M: 4.5, A: 0 };
  return asinhDefFromCofactor(150, top);
}

export function defaultAxis(ws: Workspace, g: Group, channel: string): AxisSpec {
  const existing = g.axisDefaults[channel];
  if (existing && ws.transforms[existing.transform]) return existing;
  const s = groupSample(ws, g);
  const ch = s?.channels.find((c) => c.pnn === channel);
  let top = Math.max(ch?.pnr ?? 262144, 1);
  if (ch?.kind === 'time') {
    // Time values are loaded as counts × $TIMESTEP (seconds), so $PnR must be scaled too.
    const step = Number(s?.keywords.$TIMESTEP?.trim());
    if (Number.isFinite(step) && step > 0) top = Math.max(top * step, Number.MIN_VALUE);
  }
  let t: Transform;
  if (!ch || ch.kind === 'scatter' || ch.kind === 'time' || ch.kind === 'other')
    t = { kind: 'flin', T: top, A: 0 };
  else t = { kind: 'logicle', T: Math.max(top, 1024), W: 0.5, M: 4.5, A: 0 };
  const axis: AxisSpec = { channel, comp: 'group', transform: registerTransform(ws, t), range: [0, 1] };
  g.axisDefaults[channel] = axis;
  return axis;
}

/** Sensible first two channels: FSC-A/SSC-A if present, else the first two non-time channels. */
export function defaultChannels(ws: Workspace, g: Group): [string, string] {
  const s = groupSample(ws, g);
  const names = s?.channels.filter((c) => c.kind !== 'time').map((c) => c.pnn) ?? g.channels;
  const pick = (re: RegExp) => names.find((n) => re.test(n));
  const x = pick(/^FSC-A$/i) ?? pick(/^FSC/i) ?? names[0] ?? g.channels[0] ?? '';
  const y = pick(/^SSC-A$/i) ?? pick(/^SSC/i) ?? names.find((n) => n !== x) ?? x;
  return [x, y];
}

export function newPlot(
  ws: Workspace,
  g: Group,
  population: string,
  kind: PlotKind = 'pseudocolor',
  xy?: [string, string],
): PlotSpec {
  const [xc, yc] = xy ?? defaultChannels(ws, g);
  const plot: PlotSpec = {
    id: newId('plt_'),
    population,
    kind,
    x: { ...defaultAxis(ws, g, xc) },
    style: { ...DEFAULT_STYLE },
  };
  if (kind !== 'histogram') plot.y = { ...defaultAxis(ws, g, yc) };
  g.plots.push(plot);
  return plot;
}

/** Next population colour: categorical palette in fixed order (dataviz rule: never cycled). */
export function nextColor(g: Group): string {
  const used = Object.keys(g.template.populations).length - 1;
  return CATEGORICAL[Math.min(used, CATEGORICAL.length - 1)]!;
}
