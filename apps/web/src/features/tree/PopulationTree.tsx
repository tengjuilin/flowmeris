import { type Population, childPopulations, isOverridden } from '@flowmeris/model';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFontsLoaded } from '../../components/hooks/useFontsLoaded.ts';
import { getPool } from '../../engine-client/pool.ts';
import { lineageKey } from '../../lib/keys.ts';
import { deleteGate, renamePopulation } from '../../state/commands/gates.ts';
import { drill } from '../../state/commands/plots.ts';
import { contextFor, useGroup, useSampleNames, useStore } from '../../state/store.ts';

let ctx: CanvasRenderingContext2D | null = null;
/** A canvas context to measure text with (shared). */
function textContext(): CanvasRenderingContext2D {
  ctx ??= document.createElement('canvas').getContext('2d')!;
  return ctx;
}

/**
 * The group's population tree with each population's counts in one sample. By default it shows the
 * current population in the selected sample and clicking a population opens it; the Plot view passes
 * its selected plot's population and sample, and sets that plot's population on click.
 */
export function PopulationTree({
  popId: shownPop,
  sampleId: shownSample,
  onPick,
  onWidth,
}: {
  popId?: string;
  sampleId?: string | undefined;
  onPick?: (popId: string) => void;
  /** Told the width the card needs to show every name and count in full. */
  onWidth?: (px: number) => void;
} = {}) {
  const transforms = useStore((s) => s.ws.transforms);
  const compMatrices = useStore((s) => s.ws.compMatrices);
  const uiSampleId = useStore((s) => s.ui.sampleId);
  const uiPopId = useStore((s) => s.ui.popId);
  const missing = useStore((s) => s.status.missing);
  const group = useGroup();
  const names = useSampleNames(group);
  const [counts, setCounts] = useState<Record<string, { count: number; parent: number }>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const wanted = shownSample ?? uiSampleId;
  const sampleId = group && wanted && group.sampleIds.includes(wanted) ? wanted : group?.sampleIds[0];
  const current = shownPop ?? uiPopId;
  const pick = onPick ?? drill;

  const fileName = useStore((s) => (sampleId ? s.ws.samples[sampleId]?.fileName : undefined));

  const pops = useMemo(() => (group ? Object.values(group.template.populations) : []), [group]);
  const key = useMemo(() => {
    if (!group || !sampleId) return '';
    // lineageKey reads only the workspace's transforms and compensation matrices (the dependencies).
    const ws = useStore.getState().ws;
    return JSON.stringify(pops.map((p) => lineageKey(ws, group, sampleId, p.id)));
  }, [pops, transforms, compMatrices, group, sampleId]);
  useEffect(() => {
    if (!group || !sampleId || missing[sampleId]) return;
    let live = true;
    const ac = new AbortController();
    const popIds = pops.map((p) => p.id);
    getPool()
      .counts(contextFor({ transforms, compMatrices }, group), sampleId, popIds, {
        key: JSON.stringify(['counts', popIds, key]),
        signal: ac.signal,
      })
      .then(
        (cs) =>
          live &&
          setCounts(Object.fromEntries(cs.map((c) => [c.popId, { count: c.count, parent: c.parentCount }]))),
      )
      .catch(() => {});
    return () => {
      live = false;
      ac.abort();
    };
  }, [key, sampleId]);

  // Measure each row at its natural width: the name's text in full (not what fits now) plus everything
  // else in the row, with any count wider than its column. Measured again when what the rows show
  // changes, when the card is resized (a scroll bar comes or goes) and when fonts finish loading.
  const box = useRef<HTMLDivElement>(null);
  const fontsLoaded = useFontsLoaded();
  const sampleLabel = sampleId ? (names[sampleId] ?? fileName) : '';
  useLayoutEffect(() => {
    const el = box.current;
    if (el && onWidth) onWidth(rowsWidth(el));
  }, [onWidth, group, counts, editing, current, sampleLabel, fontsLoaded]);
  useEffect(() => {
    const el = box.current;
    if (!el || !onWidth || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => onWidth(rowsWidth(el)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onWidth, !group]);

  if (!group) return null;

  const row = (p: Population, depth: number): JSX.Element => {
    const c = counts[p.id];
    const overridden = p.gate && sampleId ? isOverridden(group, p.gate, sampleId) : false;
    const kids = childPopulations(group.template, p.id).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    return (
      <li key={p.id}>
        <div className={`pop-row${current === p.id ? ' on' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
          <span className="swatch" style={{ background: p.color }} aria-hidden="true" />
          {editing === p.id ? (
            <input
              autoFocus
              defaultValue={p.name}
              aria-label="Population name"
              onBlur={(e) => {
                if (e.target.value.trim()) renamePopulation(group.id, p.id, e.target.value.trim());
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditing(null);
              }}
            />
          ) : (
            <button
              type="button"
              className="pop-name"
              onClick={() => pick(p.id)}
              onDoubleClick={() => p.gate && setEditing(p.id)}
              title={nameTitle(!!onPick, !!p.gate)}
            >
              {p.name}
            </button>
          )}
          {/* Fixed-width slots keep the count columns aligned across rows (root has no badge or delete). */}
          <span className="pop-flag">
            {overridden && (
              <span className="badge warn" title="Gate geometry overridden for this sample">
                ov
              </span>
            )}
          </span>
          <span className="num" title="Events">
            {c ? c.count.toLocaleString() : ''}
          </span>
          <span className="num pct" title="% of parent">
            {c && p.parent && c.parent > 0 ? `${((100 * c.count) / c.parent).toFixed(2)}%` : ''}
          </span>
          <span className="pop-del">
            {p.gate && (
              <button
                type="button"
                className="icon"
                title={`Delete gate${regionsNote(group.template.gates[p.gate]?.geometry.kind)} and its subpopulations`}
                onClick={() => {
                  deleteGate(group.id, p.gate!);
                  if (uiPopId === p.id) drill('root');
                  if (onPick && current === p.id) onPick('root');
                }}
              >
                ✕
              </button>
            )}
          </span>
        </div>
        {kids.length > 0 && <ul>{kids.map((k) => row(k, depth + 1))}</ul>}
      </li>
    );
  };
  const root = group.template.populations.root;
  return (
    <div className="pop-tree" ref={box}>
      <div className="pane-title">
        Populations <span className="muted small">{sampleLabel}</span>
      </div>
      <ul>{root && row(root, 0)}</ul>
    </div>
  );
}

/** The width the tree's card needs to show every row's name and counts in full. */
function rowsWidth(el: HTMLElement): number {
  let need = 0;
  const measure = textContext();
  for (const row of el.querySelectorAll<HTMLElement>('.pop-row')) {
    // A row being renamed has an input that fills whatever width the card has: not counted.
    const name = row.querySelector<HTMLElement>('.pop-name');
    if (!name) continue;
    const range = document.createRange();
    range.selectNodeContents(name);
    // Every name is measured as bold, as the selected row shows it, so selecting a population never
    // changes the card's width (and the cells it spans).
    const cs = getComputedStyle(name);
    measure.font = `600 ${cs.fontSize} ${cs.fontFamily}`;
    const text = Math.max(
      range.getBoundingClientRect().width,
      measure.measureText(name.textContent ?? '').width,
    );
    let w = row.clientWidth + Math.ceil(text) + 4 - name.clientWidth;
    for (const n of row.querySelectorAll<HTMLElement>('.num'))
      w += Math.max(0, n.scrollWidth - n.clientWidth);
    need = Math.max(need, w);
  }
  return need + el.offsetWidth - el.clientWidth;
}

/** A population name's tooltip. */
function nameTitle(picks: boolean, gated: boolean): string {
  if (picks) return `Click to show in the selected plot${gated ? '; double-click to rename' : ''}`;
  return gated ? 'Click to open; double-click to rename' : 'All events';
}

/** What deleting a gate that makes several populations also deletes. */
function regionsNote(kind: string | undefined): string {
  if (kind === 'quadrant' || kind === 'spider' || kind === 'curly') return ' (all four regions)';
  if (kind === 'split') return ' (both sides)';
  return '';
}
