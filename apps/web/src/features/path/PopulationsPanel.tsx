import { type CSSProperties, useRef, useState } from 'react';
import { useStore } from '../../state/store.ts';
import { PopulationTree } from '../tree/index.ts';

/** The populations panel leaves at least MIN_BODY of the view above it. */
const MIN_BODY = 120;

/**
 * The populations tree in a panel over the bottom right of the view, the plots showing beside it.
 * Dragging (or arrow keys on) its top edge sets its height, kept while other views are shown;
 * double-clicking it (or Enter) fits the panel to its rows, or, when it fits already, minimises it to its title.
 */
export function PopulationsPanel({
  popId,
  sampleId,
  onPick,
}: { popId: string; sampleId: string; onPick: (popId: string) => void }) {
  const height = useStore((s) => s.views.pathPanelHeight);
  const setViews = useStore((s) => s.setViews);
  const panel = useRef<HTMLDivElement>(null);
  // The panel is as wide as the longest name and its counts need (plus a little room), not the full
  // view, so each count stays close to its name.
  const [listW, setListW] = useState(0);
  const drag = useRef<{ y: number; h: number; max: number } | null>(null);
  const tree = () => panel.current?.querySelector<HTMLElement>('.pop-tree');
  /** Shortest the panel may be: its title alone (with the top border). */
  const minHeight = () => (tree()?.querySelector<HTMLElement>('.pane-title')?.offsetHeight ?? 29) + 1;
  /** Tallest the panel may be: the view's height less the toolbar and MIN_BODY of plots. */
  const maxHeight = () => {
    const view = panel.current?.closest<HTMLElement>('.path-view');
    const bar = view?.querySelector<HTMLElement>(':scope > .toolbar');
    return view ? view.clientHeight - (bar?.offsetHeight ?? 0) - MIN_BODY : 600;
  };
  const set = (h: number, max: number) =>
    setViews({ pathPanelHeight: Math.round(Math.max(minHeight(), Math.min(max, h))) });
  /** Fit the panel to its rows (as far as the view allows), or minimise it when it fits already. */
  const toggle = () => {
    const t = tree();
    if (!t) return;
    const max = maxHeight();
    // Its title and rows, measured as laid out (scrollHeight is the panel's own height when they are shorter).
    const cs = getComputedStyle(t);
    const content = [...t.children].reduce((h, c) => h + (c as HTMLElement).offsetHeight, 0);
    const edges = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'] as const;
    const fit = Math.max(
      minHeight(),
      Math.min(max, Math.ceil(content + edges.reduce((h, k) => h + Number.parseFloat(cs[k]), 0))),
    );
    set(Math.abs(height - fit) <= 1 ? minHeight() : fit, max);
  };
  return (
    <div
      className="path-dock"
      style={listW > 0 ? ({ '--pop-list-w': `${listW + 24}px` } as CSSProperties) : undefined}
    >
      <div
        className="path-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the populations panel"
        aria-valuenow={height}
        tabIndex={0}
        title="Drag to resize the populations panel; double-click to fit it to its rows or minimise it"
        onDoubleClick={toggle}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, h: panel.current?.offsetHeight ?? height, max: maxHeight() };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) set(d.h + d.y - e.clientY, d.max);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 50 : 10;
          if (e.key === 'Enter') toggle();
          else if (e.key === 'ArrowUp') set(height + step, maxHeight());
          else if (e.key === 'ArrowDown') set(height - step, maxHeight());
          else return;
          e.preventDefault();
        }}
      />
      <div className="plot-side path-panel" ref={panel} style={{ height }}>
        <PopulationTree popId={popId} sampleId={sampleId} onPick={onPick} onWidth={setListW} />
      </div>
    </div>
  );
}
