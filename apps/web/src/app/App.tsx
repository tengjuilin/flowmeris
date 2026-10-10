import { useCallback, useEffect, useState } from 'react';
import { Sidebar } from '../components/Sidebar.tsx';
import { useStore } from '../state/store.ts';
import { Header } from './Header.tsx';
import { Overlays } from './Overlays.tsx';
import { TabBar } from './TabBar.tsx';
import { Welcome } from './Welcome.tsx';
import { useDropIngest } from './useDropIngest.ts';
import { useHotkeys } from './useHotkeys.ts';
import { VIEW_DEFS } from './views.tsx';

/** The app: header, sidebar, the open view and its settings panel (views are defined in views.tsx). */
export function App() {
  const view = useStore((s) => s.ui.view);
  const groupId = useStore((s) => s.ui.groupId);
  const views = useStore((s) => s.views);
  const setViews = useStore((s) => s.setViews);
  const setUi = useStore((s) => s.setUi);
  const groups = useStore((s) => s.ws.groups);
  const { dragOver, props: dropProps } = useDropIngest();
  // On narrow windows the settings panel is a drawer opened from the Settings button.
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  useHotkeys(drawer ? closeDrawer : undefined);

  useEffect(() => {
    if (!groupId && groups[0]) setUi({ groupId: groups[0].id, sampleId: groups[0].sampleIds[0] ?? null });
  }, [groupId, groups, setUi]);

  const def = VIEW_DEFS[view];
  const { Main, Panel, panelFlag } = def;
  // A panel the view's toolbar shows and hides is open per that preference; the others always render
  // (beside the view, or in the drawer on narrow windows).
  const flagOpen = panelFlag ? views[panelFlag] : false;
  const open = panelFlag ? flagOpen : drawer;

  return (
    <div className={`app${dragOver ? ' drag-over' : ''}`} {...dropProps}>
      <Header />
      {groups.length === 0 ? (
        <Welcome />
      ) : (
        <div className="main">
          <Sidebar />
          <section className="center">
            <TabBar drawer={drawer} onToggleDrawer={() => setDrawer((d) => !d)} />
            <div className="view">
              <Main />
            </div>
          </section>
          {Panel && (!panelFlag || flagOpen) && (
            <>
              <button
                type="button"
                className="drawer-scrim"
                aria-label="Close settings"
                tabIndex={-1}
                data-open={open}
                onClick={() => (panelFlag ? setViews({ [panelFlag]: false }) : setDrawer(false))}
              />
              <div className="inspector-drawer" data-open={open}>
                <Panel />
              </div>
            </>
          )}
        </div>
      )}
      <Overlays />
    </div>
  );
}
