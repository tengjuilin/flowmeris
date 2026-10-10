/**
 * The settings panels' shared UI. A panel's tabs and cards are declared in `lib/panelSpecs.ts`; its
 * tab and open cards come from `useSettingsPanel` (`state/prefs.ts`); it is drawn with `SettingsPanel`
 * and `Card`. Change the look of every panel here and in `styles/inspector.css`.
 */
export { Card } from './Card.tsx';
export { InspectorTabs, PanelReset, type InspectorTab } from './InspectorTabs.tsx';
export { EmptyPanel, SettingsPanel } from './SettingsPanel.tsx';
