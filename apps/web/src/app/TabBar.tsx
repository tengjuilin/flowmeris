import { SettingsIcon } from '../components/ui/icons.tsx';
import { type NavLocation, useGroup, useStore } from '../state/store.ts';
import { VIEW_DEFS, VIEW_ORDER } from './views.tsx';

/** The tab bar: Back and Forward, a tab per view, and the Settings button of views with a settings drawer. */

/** A chevron pointing left (Back) or right (Forward). */
function NavIcon({ dir }: { dir: -1 | 1 }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d={dir < 0 ? 'M9 2.5 4.5 7 9 11.5' : 'M5 2.5 9.5 7 5 11.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Back and Forward through the tabs visited, like a browser's. */
function NavButtons() {
  const nav = useStore((s) => s.nav);
  const navigate = useStore((s) => s.navigate);
  const label = (l: NavLocation | undefined) => (l ? ` to ${VIEW_DEFS[l.view].label}` : '');
  return (
    <div className="nav-buttons">
      <button
        type="button"
        className="icon"
        title={`Back${label(nav.back[nav.back.length - 1])} (Alt+←)`}
        aria-label="Back"
        disabled={nav.back.length === 0}
        onClick={() => navigate(-1)}
      >
        <NavIcon dir={-1} />
      </button>
      <button
        type="button"
        className="icon"
        title={`Forward${label(nav.forward[nav.forward.length - 1])} (Alt+→)`}
        aria-label="Forward"
        disabled={nav.forward.length === 0}
        onClick={() => navigate(1)}
      >
        <NavIcon dir={1} />
      </button>
    </div>
  );
}

export function TabBar({ drawer, onToggleDrawer }: { drawer: boolean; onToggleDrawer: () => void }) {
  const view = useStore((s) => s.ui.view);
  const popId = useStore((s) => s.ui.popId);
  const setUi = useStore((s) => s.setUi);
  const group = useGroup();
  const def = VIEW_DEFS[view];
  return (
    <div className="tabs-bar">
      <NavButtons />
      <div className="tabs" role="tablist">
        {VIEW_ORDER.map((id) => (
          <button
            type="button"
            role="tab"
            aria-selected={view === id}
            key={id}
            className={view === id ? 'on' : ''}
            onClick={() => {
              setUi({ view: id });
              if (group) VIEW_DEFS[id].onOpen?.(popId);
            }}
          >
            {VIEW_DEFS[id].label}
          </button>
        ))}
      </div>
      {def.Panel && !def.panelFlag && (
        <button
          type="button"
          className="settings-toggle"
          aria-expanded={drawer}
          aria-label="Settings"
          title="Settings"
          onClick={onToggleDrawer}
        >
          <SettingsIcon />
        </button>
      )}
    </div>
  );
}
