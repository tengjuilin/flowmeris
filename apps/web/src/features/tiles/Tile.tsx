import type { Group, PlotSpec, Workspace } from '@flowmeris/model';
import type { ReactNode } from 'react';
import { useVisible } from '../../components/hooks/useVisible.ts';
import { OpenInIcon } from '../../components/ui/icons.tsx';
import { drill } from '../../state/commands/plots.ts';
import { PlotCanvas } from '../plot/index.ts';

/** What a tile draws: one sample's plot, with the props making its axis titles clickable. */
export interface TilePlot {
  ws: Workspace;
  group: Group;
  sampleId: string;
  plot: PlotSpec;
  onPickChannel?: (axis: 'x' | 'y', channel: string) => void;
  pickChannelAxes?: readonly ('x' | 'y')[];
  onPickHistNorm?: (norm: PlotSpec['style']['histNorm']) => void;
}

/**
 * One tile: its title with buttons, and its plot, drawn once scrolled into view. The selected tile
 * (`current`) draws and edits gates as in the Gate view; pressing another one selects it.
 */
export function Tile({
  name,
  hint,
  badge,
  buttons,
  current,
  onSelect,
  size,
  renderSize,
  ...canvas
}: TilePlot & {
  name: string;
  hint?: string;
  badge?: ReactNode;
  buttons: ReactNode;
  current: boolean;
  onSelect: () => void;
  size: number;
  renderSize: number;
}) {
  const [ref, visible] = useVisible<HTMLDivElement>();
  return (
    <div
      className={`tile${current ? ' on' : ''}`}
      ref={ref}
      onPointerDownCapture={() => {
        if (!current) onSelect();
      }}
    >
      <div className="tile-title" title={hint}>
        <span>{name}</span>
        {badge}
        {buttons}
      </div>
      <div style={{ width: size, height: size, overflow: 'hidden' }}>
        {/* While the size slider moves, the last render is stretched to the live size; it is redrawn
            sharp at `renderSize` once the slider settles. */}
        {visible && (
          <div
            style={
              size === renderSize
                ? undefined
                : { transform: `scale(${size / renderSize})`, transformOrigin: '0 0' }
            }
          >
            <PlotCanvas
              {...canvas}
              width={renderSize}
              height={renderSize}
              hideOffScaleNote
              interactive={current}
              onDrill={drill}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** A labeled button in a tile's title that opens the tile elsewhere. */
export function TileButton({
  label,
  title,
  ariaLabel,
  onClick,
}: { label: string; title: string; ariaLabel: string; onClick: () => void }) {
  return (
    <button type="button" className="icon labeled" title={title} aria-label={ariaLabel} onClick={onClick}>
      <OpenInIcon />
      {label}
    </button>
  );
}
