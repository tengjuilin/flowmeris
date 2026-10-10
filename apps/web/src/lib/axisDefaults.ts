import {
  type AxisSpec,
  type Group,
  type Sample,
  type Transform,
  type Workspace,
  transformId,
} from '@flowmeris/model';
import { asinhDefFromCofactor, linearDef, logDef, logicleDef } from '@flowmeris/transforms';

/** Default axes and the scale choices offered for an axis. */

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
  if (k === 'linear') return linearDef(top);
  if (k === 'log') return logDef(top, Math.max(1, Math.round(Math.log10(top))));
  if (k === 'logicle') return logicleDef(top);
  return asinhDefFromCofactor(150, top);
}

/**
 * The built-in axis for a channel (docs/guide/axes.md), ignoring any scale the user has since set as the
 * group's default: scatter, time and other channels linear over [0, $PnR] (time channels over [0, largest
 * time in the data]); fluorescence channels logicle with T = $PnR (min 1024), W = 0.5, M = 4.5, A = 0.
 * All map to display range [0, 1]. Registers the transform in `ws` (call inside `mutate`).
 */
export function factoryAxis(ws: Workspace, g: Group, channel: string): AxisSpec {
  const s = groupSample(ws, g);
  const ch = s?.channels.find((c) => c.pnn === channel);
  let top = Math.max(ch?.pnr ?? 262144, 1);
  if (ch?.kind === 'time') {
    // Time values are seconds (counts × $TIMESTEP): fit the largest time in the group's samples,
    // else scale $PnR the same way.
    let max = 0;
    for (const id of g.sampleIds) {
      const m = ws.samples[id]?.channels.find((c) => c.pnn === channel)?.dataMax;
      if (m !== undefined && m > max) max = m;
    }
    const step = Number(s?.keywords.$TIMESTEP?.trim());
    if (max > 0) top = max;
    else if (Number.isFinite(step) && step > 0) top = Math.max(top * step, Number.MIN_VALUE);
  }
  let t: Transform;
  if (!ch || ch.kind === 'scatter' || ch.kind === 'time' || ch.kind === 'other') t = linearDef(top);
  else t = logicleDef(Math.max(top, 1024));
  return { channel, comp: 'group', transform: registerTransform(ws, t), range: [0, 1] };
}

/** Whether `a` has its channel's built-in scale and range (`factoryAxis`). */
export function axisAtFactory(ws: Workspace, g: Group, a: AxisSpec): boolean {
  const f = factoryAxis(ws, g, a.channel);
  return a.transform === f.transform && a.range[0] === f.range[0] && a.range[1] === f.range[1];
}

/** Puts `a` back to its channel's built-in scale and range (call inside `mutate`). */
export function resetAxisToFactory(ws: Workspace, g: Group, a: AxisSpec): void {
  const f = factoryAxis(ws, g, a.channel);
  a.transform = f.transform;
  a.range = [...f.range];
}

/**
 * The group's default axis for a channel: the one the user set, else the built-in one, which is then
 * saved as the group's default (call inside `mutate`).
 */
export function defaultAxis(ws: Workspace, g: Group, channel: string): AxisSpec {
  const existing = g.axisDefaults[channel];
  if (existing && ws.transforms[existing.transform]) return existing;
  const axis = factoryAxis(ws, g, channel);
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
