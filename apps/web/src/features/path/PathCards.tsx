import type { Group, PlotSpec, Population, Workspace } from '@flowmeris/model';
import { Component, type ReactNode, memo, useEffect, useMemo, useRef, useState } from 'react';
import { withBaseFont } from '../../lib/figure.ts';
import { type Count, pctOfParent } from '../../lib/gatingPath.ts';
import { openPathPlot } from '../../state/commands/plots.ts';
import { PlotCanvas, plotBox } from '../plot/index.ts';

/** Base font size (px) of the plots, as in Tiles. */
const FONT_PX = 11;

/**
 * Renders `children` once the placeholder comes within a margin of the viewport, then keeps them
 * mounted. A large tree then computes and draws only the plots that are (or have been) on screen.
 * The placeholder takes the plot's own size, so nothing moves when the plot replaces it.
 */
export function WhenVisible({
  width,
  height,
  children,
}: { width: number; height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return seen ? (
    <>{children}</>
  ) : (
    <div ref={ref} className="path-placeholder" style={{ width, height }} aria-hidden="true" />
  );
}

interface CardProps {
  ws: Workspace;
  group: Group;
  sampleId: string;
  pop: Population;
  plot: PlotSpec;
  real: boolean;
  size: number;
  renderSize: number;
  count: Count | undefined;
  focusPopId?: string;
  backgate?: { popId: string; color: string };
}

/** Memoised: a card re-renders only when its own plot, count, size or overlay changes. */
export const StepCard = memo(function StepCard({
  ws,
  group,
  sampleId,
  pop,
  plot,
  real,
  size,
  renderSize,
  count: c,
  focusPopId,
  backgate,
}: CardProps) {
  // Drawn with the small base font; the saved plot itself (opened on click) keeps its own.
  const shown = useMemo(() => withBaseFont(plot, FONT_PX), [plot]);
  const box = plotBox(shown, size, size);
  return (
    <div className="path-card">
      <button
        type="button"
        className="tile-title"
        title={`Open ${pop.name} in the Gate view`}
        onClick={() => openPathPlot(pop.id, plot, real)}
      >
        <span>
          <span className="swatch" style={{ background: pop.color }} aria-hidden="true" /> {pop.name}
        </span>
        <span className="muted num">
          {/* A space until the count arrives, so the title keeps its height. */}
          {c ? c.count.toLocaleString() : '\u00a0'}
          {pop.parent && c ? ` · ${pctOfParent(c)}` : ''}
        </span>
      </button>
      <WhenVisible width={box.width} height={box.height}>
        {/* While the size changes, the last render is stretched to the live size (as in Tiles). */}
        <div style={{ width: size, height: size, overflow: 'hidden' }}>
          <div
            style={
              size === renderSize
                ? undefined
                : { transform: `scale(${size / renderSize})`, transformOrigin: '0 0' }
            }
          >
            <PlotCanvas
              ws={ws}
              group={group}
              sampleId={sampleId}
              plot={shown}
              width={renderSize}
              height={renderSize}
              hideOffScaleNote
              {...(focusPopId ? { focusPopId } : {})}
              {...(backgate ? { backgate } : {})}
            />
          </div>
        </div>
      </WhenVisible>
    </div>
  );
});

export function PopChip({ pop, count: c, on }: { pop: Population; count: Count | undefined; on: boolean }) {
  return (
    <button
      type="button"
      className={`path-chip${on ? ' on' : ''}`}
      title={`Open ${pop.name} in the Gate view`}
      onClick={() => openPathPlot(pop.id, null, false)}
    >
      <span className="swatch" style={{ background: pop.color }} aria-hidden="true" />
      <strong>{pop.name}</strong>
      <span className="num">{c ? c.count.toLocaleString() : ''}</span>
      {pop.parent && <span className="num muted">{pctOfParent(c)}</span>}
    </button>
  );
}

/** Shows a render error in place of its children instead of leaving the view blank. */
export class ViewErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { error: Error | null }
> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  override render() {
    return this.state.error ? (
      <div className="empty">Could not draw the gating tree: {this.state.error.message}</div>
    ) : (
      this.props.children
    );
  }
}
