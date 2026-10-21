import { ellipseAxes, ellipseFromAxes } from '@flowmeris/gating';
import {
  type Gate,
  type Geometry,
  effectiveGeometry,
  isOverridden,
  populationsOfGate,
} from '@flowmeris/model';
import { NumInput } from '../../components/ui/NumInput.tsx';
import { DeleteIcon } from '../../components/ui/icons.tsx';
import { Card } from '../../components/ui/settings/index.ts';
import { type CurlyGeometry, curlyAt, curlyAxes, withCurliness } from '../../lib/curlyEdit.ts';
import { straighten, translate, withLegs } from '../../lib/gateEdit.ts';
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
      : geom.kind === 'curly'
        ? 'Curly quadrant'
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
      {geom.kind === 'quadrant' && <QuadrantFields geom={geom} commit={commit} />}
      {geom.kind === 'curly' && <CurlyFields geom={geom} dims={gate.dims} commit={commit} />}
      {geom.kind === 'spider' && (
        <div className="grid2">
          <NumInput
            label="Center x"
            value={geom.center[0]}
            onCommit={(v) => commit(translate(geom, v - geom.center[0], 0))}
          />
          <NumInput
            label="Center y"
            value={geom.center[1]}
            onCommit={(v) => commit(translate(geom, 0, v - geom.center[1]))}
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

type QuadrantGeometry = Extract<Geometry, { kind: 'quadrant' }>;

/**
 * A quadrant's center and, once a leg has been dragged apart (an offset quadrant), its two legs on the
 * offset divider and a button that joins them again.
 */
function QuadrantFields({ geom, commit }: { geom: QuadrantGeometry; commit: (g: Geometry) => void }) {
  const off = geom.offset;
  return (
    <>
      <div className="grid2">
        <NumInput
          label="Center x"
          value={geom.center[0]}
          onCommit={(v) => commit(translate(geom, v - geom.center[0], 0))}
        />
        <NumInput
          label="Center y"
          value={geom.center[1]}
          onCommit={(v) => commit(translate(geom, 0, v - geom.center[1]))}
        />
        {off && (
          <>
            <NumInput
              label={off.axis === 'x' ? 'Lower leg x' : 'Left leg y'}
              value={off.lo}
              onCommit={(v) => commit(withLegs(geom, off.axis, v, off.hi))}
            />
            <NumInput
              label={off.axis === 'x' ? 'Upper leg x' : 'Right leg y'}
              value={off.hi}
              onCommit={(v) => commit(withLegs(geom, off.axis, off.lo, v))}
            />
          </>
        )}
      </div>
      {off ? (
        <div className="row">
          <button
            type="button"
            title="Join the legs at the center into a plain quadrant"
            onClick={() => commit(straighten(geom))}
          >
            Straighten
          </button>
        </div>
      ) : (
        <p className="muted small">Drag a leg's round handle to offset it.</p>
      )}
    </>
  );
}

/**
 * A curly quadrant's center and the curliness a of its upper and right legs (x = cx + a·(√y − √cy) in
 * linear data units). A curliness that would make the legs cross is not applied.
 */
function CurlyFields({
  geom,
  dims,
  commit,
}: { geom: CurlyGeometry; dims: Gate['dims']; commit: (g: Geometry) => void }) {
  const ws = useStore((s) => s.ws);
  const axes = curlyAxes(ws, dims);
  const [cx, cy] = geom.center;
  const [aUp, aRight] = geom.a;
  const setA = (a: [number, number]) => {
    const g = a[0] >= 0 && a[1] >= 0 ? withCurliness(geom, a, axes) : null;
    if (g) commit(g);
  };
  return (
    <>
      <div className="grid2">
        <NumInput label="Center x" value={cx} onCommit={(v) => commit(curlyAt(geom, [v, cy], axes))} />
        <NumInput label="Center y" value={cy} onCommit={(v) => commit(curlyAt(geom, [cx, v], axes))} />
        <NumInput
          label="Upper leg curliness"
          value={aUp}
          onCommit={(v) => setA([v, aRight])}
          title="a in x = cx + a·(√y − √cy), in linear data units; 0 makes the leg straight"
        />
        <NumInput
          label="Right leg curliness"
          value={aRight}
          onCommit={(v) => setA([aUp, v])}
          title="a in y = cy + a·(√x − √cx), in linear data units; 0 makes the leg straight"
        />
      </div>
      <p className="muted small">Drag a curved leg's round handle to change how much it curls.</p>
    </>
  );
}
