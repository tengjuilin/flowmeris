import { ellipseAxes, ellipseFromAxes } from '@flowmeris/gating';
import { type Geometry, effectiveGeometry, isOverridden, populationsOfGate } from '@flowmeris/model';
import { NumInput } from '../../components/ui/NumInput.tsx';
import { DeleteIcon } from '../../components/ui/icons.tsx';
import { Card } from '../../components/ui/settings/index.ts';
import type { PlotCard } from '../../lib/panelSpecs.ts';
import type { CardOf } from '../../lib/settingsPanel.ts';
import { deleteGate, promoteOverride, revertOverride, setGateGeometry } from '../../state/commands/gates.ts';
import { useGroup, useStore } from '../../state/store.ts';

/** One gate's exact coordinates, editable live, with a delete button at the card's top right. */
export function GateEditor({ gateId, card }: { gateId: string; card: CardOf<PlotCard> }) {
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const group = useGroup()!;
  const gate = group.template.gates[gateId];
  if (!gate) return null;
  const sampleId = ui.sampleId ?? group.sampleIds[0]!;
  const geom = effectiveGeometry(group, gate.id, sampleId);
  const ov = isOverridden(group, gate.id, sampleId);
  const pops = populationsOfGate(group.template, gate.id);
  const commit = (g: Geometry) =>
    setGateGeometry(group.id, gate.id, g, ui.editScope, sampleId, `gate:${gate.id}:${ui.editScope}`);
  // A quadrant, spider or bisector gate makes several populations; name the card by its kind rather than list them all.
  const name =
    geom.kind === 'split'
      ? 'Bisector'
      : pops.length > 1
        ? `${geom.kind[0]!.toUpperCase()}${geom.kind.slice(1)}`
        : (pops[0]?.name ?? 'Gate');

  return (
    <Card
      {...card(`gate-${gate.id}`, undefined, name)}
      className={ui.selectedGateId === gate.id ? 'selected' : undefined}
      actions={
        <button
          type="button"
          className="icon reset-btn danger-icon"
          title={`Delete gate ${name}`}
          aria-label={`Delete gate ${name}`}
          onClick={() => {
            deleteGate(group.id, gate.id);
            if (ui.selectedGateId === gate.id) setUi({ selectedGateId: null });
          }}
        >
          <DeleteIcon />
        </button>
      }
    >
      {geom.kind === 'rect' && (
        <div className="grid2">
          {gate.dims.map((d, i) => (
            <div key={d.channel} className="grid2 span2">
              <NumInput
                label={`${d.channel} min`}
                value={geom.min[i] ?? Number.NEGATIVE_INFINITY}
                onCommit={(v) => commit({ ...geom, min: geom.min.map((x, k) => (k === i ? v : x)) })}
              />
              <NumInput
                label={`${d.channel} max`}
                value={geom.max[i] ?? Number.POSITIVE_INFINITY}
                onCommit={(v) => commit({ ...geom, max: geom.max.map((x, k) => (k === i ? v : x)) })}
              />
            </div>
          ))}
        </div>
      )}
      {geom.kind === 'split' && (
        <div className="grid2">
          <NumInput
            label={`${gate.dims[0]!.channel} divider`}
            value={geom.at}
            onCommit={(v) => commit({ ...geom, at: v })}
            title="Events below this value are in the − population, events at or above it in the + population"
          />
        </div>
      )}
      {(geom.kind === 'quadrant' || geom.kind === 'spider') && (
        <div className="grid2">
          <NumInput
            label="Center x"
            value={geom.center[0]}
            onCommit={(v) =>
              commit(
                geom.kind === 'quadrant'
                  ? { ...geom, center: [v, geom.center[1]] }
                  : {
                      ...geom,
                      center: [v, geom.center[1]],
                      arms: geom.arms.map(([a, b]) => [a + v - geom.center[0], b]) as typeof geom.arms,
                    },
              )
            }
          />
          <NumInput
            label="Center y"
            value={geom.center[1]}
            onCommit={(v) =>
              commit(
                geom.kind === 'quadrant'
                  ? { ...geom, center: [geom.center[0], v] }
                  : {
                      ...geom,
                      center: [geom.center[0], v],
                      arms: geom.arms.map(([a, b]) => [a, b + v - geom.center[1]]) as typeof geom.arms,
                    },
              )
            }
          />
        </div>
      )}
      {geom.kind === 'ellipse' &&
        (() => {
          const e = ellipseAxes(geom.mean, geom.cov, geom.d2);
          const set = (p: Partial<typeof e>) => {
            const n = { ...e, ...p };
            commit({ kind: 'ellipse', ...ellipseFromAxes(n.cx, n.cy, n.a, n.b, n.theta) });
          };
          return (
            <div className="grid2">
              <NumInput label="Center x" value={e.cx} onCommit={(cx) => set({ cx })} />
              <NumInput label="Center y" value={e.cy} onCommit={(cy) => set({ cy })} />
              <NumInput label="Semi-axis a" value={e.a} onCommit={(a) => a > 0 && set({ a })} />
              <NumInput label="Semi-axis b" value={e.b} onCommit={(b) => b > 0 && set({ b })} />
              <NumInput
                label="Angle (°)"
                value={(e.theta * 180) / Math.PI}
                onCommit={(d) => set({ theta: (d * Math.PI) / 180 })}
              />
            </div>
          );
        })()}
      {geom.kind === 'polygon' && (
        <p className="muted small">
          {geom.vertices.length} vertices. Drag vertices; click an edge midpoint to add one.
        </p>
      )}
      {ov && (
        <div className="row">
          <span className="badge warn">Overridden for this sample</span>
          <button type="button" onClick={() => revertOverride(group.id, gate.id, sampleId)}>
            Revert to template
          </button>
          <button type="button" onClick={() => promoteOverride(group.id, gate.id, sampleId)}>
            Make this the template
          </button>
        </div>
      )}
    </Card>
  );
}
