import { ListActions } from '../../../components/ui/ListActions.tsx';
import { ReorderList, type RowSelection } from '../../../components/ui/ReorderList.tsx';
import { ResetIcon } from '../../../components/ui/icons.tsx';
import { moveRidges, withoutRidges } from '../../../lib/ridgePanels.ts';
import { ridgeColor } from '../../../lib/ridgeStyle.ts';
import type { RidgeTabProps } from '../ridgeEdits.ts';

/**
 * The Sample tab: each ridge's order, color and label. A color change or reset applies to every
 * selected ridge if the edited one is selected.
 */
export function SampleTab({ r, fx, selection }: RidgeTabProps & { selection: RowSelection }) {
  const { style, rows, allIds, update } = r;
  const { set } = fx;
  const ordered = rows.map((x) => x.id);
  const labels = Object.fromEntries(rows.map((x) => [x.id, x.label]));
  const name = (id: string) => labels[id] ?? id;
  const current = new Set(allIds);
  const { selected, targets } = selection;

  /** Move `ids` next to `target`; hidden samples keep their slots. */
  const moveTo = (ids: string[], target: string, after: boolean) => {
    const order = moveRidges(style.order, allIds, ordered, ids, target, after);
    if (order) update('Reorder ridges', (l) => void (l.style.order = order));
  };

  return (
    <>
      <ListActions
        onReverse={() =>
          update('Reverse ridge order', (l) => {
            l.style.order = [...allIds].reverse().concat(l.style.order.filter((id) => !current.has(id)));
          })
        }
        resets={[
          {
            label: 'Order',
            title: 'Reset the order',
            disabled: !style.order.some((id) => current.has(id)),
            run: () =>
              set(
                'order',
                style.order.filter((id) => !current.has(id)),
                'Reset ridge order',
              ),
          },
          {
            label: 'Colors',
            title: 'Reset the colors',
            disabled: !Object.keys(style.sampleColors).some((id) => current.has(id)),
            run: () => set('sampleColors', withoutRidges(style.sampleColors, current), 'Reset ridge colors'),
          },
          {
            label: 'Labels',
            title: 'Reset the labels',
            disabled: !Object.keys(style.sampleLabels).some((id) => current.has(id)),
            run: () => set('sampleLabels', withoutRidges(style.sampleLabels, current), 'Reset ridge labels'),
          },
        ]}
      />
      {selected.size > 1 && (
        <p className="small muted">{selected.size} selected — a color change applies to all of them.</p>
      )}
      <ReorderList
        ids={ordered}
        name={name}
        gripTitle="Drag to reorder; click to select (⌘/Ctrl-click to add, Shift-click for a range)"
        onMove={moveTo}
        selection={selection}
      >
        {(id, i) => {
          const custom = style.sampleColors[id] !== undefined;
          const isSel = selected.has(id);
          return (
            <>
              <input
                type="color"
                className={custom ? 'custom' : ''}
                value={ridgeColor(style, id, i)}
                title={
                  isSel && selected.size > 1
                    ? `Set color of ${selected.size} selected ridges`
                    : custom
                      ? 'Custom color'
                      : 'Color from the ridge settings; pick to override'
                }
                aria-label={`Color of ${name(id)}`}
                onChange={(e) => {
                  const ids = targets(id);
                  const v = e.target.value;
                  update(
                    'Ridge color',
                    (l) => {
                      for (const x of ids) l.style.sampleColors[x] = v;
                    },
                    `color:${ids.join(',')}`,
                  );
                }}
              />
              <button
                type="button"
                className="reset-btn"
                disabled={!custom}
                title="Reset color to the ridge settings"
                aria-label={`Reset color of ${name(id)}`}
                onClick={() => {
                  const ids = targets(id);
                  update('Reset ridge color', (l) => {
                    for (const x of ids) delete l.style.sampleColors[x];
                  });
                }}
              >
                <ResetIcon />
              </button>
              <input
                type="text"
                value={style.sampleLabels[id] ?? ''}
                placeholder={name(id)}
                aria-label={`Label of ${name(id)}`}
                onChange={(e) =>
                  update(
                    'Ridge label',
                    (l) => {
                      if (e.target.value) l.style.sampleLabels[id] = e.target.value;
                      else delete l.style.sampleLabels[id];
                    },
                    `label:${id}`,
                  )
                }
              />
              <button
                type="button"
                className="reset-btn"
                disabled={style.sampleLabels[id] === undefined}
                title="Reset label to the sample name"
                aria-label={`Reset label of ${name(id)}`}
                onClick={() => {
                  const ids = targets(id);
                  update('Reset ridge label', (l) => {
                    for (const x of ids) delete l.style.sampleLabels[x];
                  });
                }}
              >
                <ResetIcon />
              </button>
            </>
          );
        }}
      </ReorderList>
    </>
  );
}
