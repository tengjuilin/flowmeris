import type { Group, PlotSpec } from '@flowmeris/model';
import { useEffect, useRef, useState } from 'react';
import { channelOptions } from '../../components/ui/PickerMenu.tsx';
import { useSampleNames, useStore } from '../../state/store.ts';
import { useChannelSample } from './ChannelTiles.tsx';

/**
 * The Tiles toolbar's mode controls: tile by samples or by channels; in Channels mode, the sample shown,
 * the axis kept and the channels the other axis goes through.
 */
export function TilesModeControls({ group, plot }: { group: Group; plot: PlotSpec }) {
  const mode = useStore((s) => s.views.tilesMode);
  const fixed = useStore((s) => s.views.tilesFixedAxis);
  const setViews = useStore((s) => s.setViews);
  const is1d = plot.kind === 'histogram' || !plot.y;
  return (
    <>
      <div className="seg" title="Tile the plot over the samples, or one sample's plot over its channels">
        <button
          type="button"
          className={mode === 'samples' ? 'on' : ''}
          onClick={() => setViews({ tilesMode: 'samples' })}
        >
          Samples
        </button>
        <button
          type="button"
          className={mode === 'channels' ? 'on' : ''}
          onClick={() => setViews({ tilesMode: 'channels' })}
        >
          Channels
        </button>
      </div>
      {mode === 'channels' && (
        <>
          <SampleStep group={group} />
          {!is1d && (
            <div className="seg" title="The axis kept on every tile; the other goes through the channels">
              {(['x', 'y'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  className={fixed === a ? 'on' : ''}
                  aria-label={`Fix the ${a} axis`}
                  onClick={() => setViews({ tilesFixedAxis: a })}
                >
                  {a.toUpperCase()} fixed: {plot[a]?.channel}
                </button>
              ))}
            </div>
          )}
          <ChannelsMenu group={group} plot={plot} />
        </>
      )}
    </>
  );
}

/** The sample the Channels mode shows, with buttons for the previous and next sample of the group. */
function SampleStep({ group }: { group: Group }) {
  const sampleId = useChannelSample(group);
  const names = useSampleNames(group);
  const setUi = useStore((s) => s.setUi);
  const ids = group.sampleIds;
  const pick = (id: string) => setUi({ sampleId: id, selectedGateId: null });
  const step = (d: number) => {
    if (!sampleId || ids.length < 2) return;
    pick(ids[(ids.indexOf(sampleId) + d + ids.length) % ids.length]!);
  };
  return (
    <div className="tiles-sample">
      <button type="button" className="icon" title="Previous sample" onClick={() => step(-1)}>
        ◀
      </button>
      <select aria-label="Sample" value={sampleId ?? ''} onChange={(e) => pick(e.target.value)}>
        {ids.map((id) => (
          <option key={id} value={id}>
            {names[id] ?? id}
          </option>
        ))}
      </select>
      <button type="button" className="icon" title="Next sample" onClick={() => step(1)}>
        ▶
      </button>
    </div>
  );
}

/** A checklist of the channels the varied axis goes through; unchecked ones are hidden. */
function ChannelsMenu({ group, plot }: { group: Group; plot: PlotSpec }) {
  const ws = useStore((s) => s.ws);
  const sampleId = useChannelSample(group);
  const hidden = useStore((s) => s.views.tilesHiddenChannels);
  const fixed = useStore((s) => s.views.tilesFixedAxis);
  const setViews = useStore((s) => s.setViews);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const options = channelOptions(group, sampleId ? ws.samples[sampleId] : undefined);
  const is1d = plot.kind === 'histogram' || !plot.y;
  const kept = is1d ? undefined : plot[fixed]?.channel;
  const shownCount = options.filter((o) => o.value !== kept && !hidden.includes(o.value)).length;
  const toggle = (ch: string, show: boolean) =>
    setViews({ tilesHiddenChannels: show ? hidden.filter((c) => c !== ch) : [...hidden, ch] });
  return (
    <div className="tiles-channels" ref={ref}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Channels ({shownCount})
      </button>
      {open && (
        <div className="tiles-channels-pop" aria-label="Channels shown">
          <div className="tiles-channels-actions">
            <button type="button" onClick={() => setViews({ tilesHiddenChannels: [] })}>
              Show all
            </button>
            <button
              type="button"
              onClick={() => setViews({ tilesHiddenChannels: options.map((o) => o.value) })}
            >
              Hide all
            </button>
          </div>
          {options.map((o) => (
            <label
              key={o.value}
              className="tiles-channel"
              title={o.value === kept ? 'On the fixed axis' : undefined}
            >
              <input
                type="checkbox"
                disabled={o.value === kept}
                checked={o.value !== kept && !hidden.includes(o.value)}
                onChange={(e) => toggle(o.value, e.target.checked)}
              />
              <span>{o.label}</span>
              {o.detail && <span className="tiles-channel-detail">{o.detail}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
