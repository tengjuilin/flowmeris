import { APP_INFO } from '../state/store.ts';
import { FolderButtons } from './Header.tsx';

/** The start page shown while the workspace has no samples. */
export function Welcome() {
  return (
    <div className="welcome">
      <h1>Flow cytometry analysis, in your browser</h1>
      <p>
        Drop a folder of <code>.fcs</code> files here (or use <strong>Add folder…</strong>). Each folder
        becomes a <em>group</em> whose gates, plots and statistics apply to every file in it. Files are parsed
        locally and never uploaded.
      </p>
      <ol>
        <li>Gate on the first sample: rectangle, ellipse, polygon, quadrant, spider or range gates.</li>
        <li>Double-click a gate to drill into that population and keep gating.</li>
        <li>
          Check every sample in <strong>Tiles</strong> and <strong>Ridge</strong> views; adjust individual
          samples with “This sample only”.
        </li>
        <li>Export statistics (CSV), plots (SVG/PNG), gates (Gating-ML 2.0) and the workspace.</li>
      </ol>
      <div className="row">
        <FolderButtons />
      </div>
      <p className="muted small">
        Flowmeris {APP_INFO.version} ({APP_INFO.commit}). Methods are documented with references and validated
        against FlowKit and the ISAC Gating-ML 2.0 compliance suite.
      </p>
    </div>
  );
}
