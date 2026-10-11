import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { getPool } from './engine-client/pool.ts';
import { registerBundledFonts } from './lib/fonts/index.ts';
import { checkMissing } from './state/commands/ingest.ts';
import { loadAutosave, startAutosave } from './state/persist.ts';
import { useStore } from './state/store.ts';
import './styles/index.css';

async function boot() {
  // The figure fonts (ADR-0011), downloaded when a figure first uses them.
  registerBundledFonts();
  const saved = await loadAutosave();
  if (saved) useStore.getState().setWorkspace(saved);
  startAutosave();
  await getPool().whenReady();
  if (navigator.storage?.persist) void navigator.storage.persist();
  if (saved) await checkMissing();
  if (import.meta.env.DEV) {
    // Development/testing hook (not in production builds): load files by URL.
    const { ingestFiles } = await import('./state/commands/ingest.ts');
    (window as unknown as Record<string, unknown>).__flowmeris = {
      store: useStore,
      async loadUrls(urls: string[], folder: string) {
        const files = await Promise.all(
          urls.map(async (u) => {
            const name = decodeURIComponent(u.split('/').pop() ?? 'file.fcs');
            const blob = await (await fetch(u)).blob();
            return { file: new File([blob], name), path: `${folder}/${name}` };
          }),
        );
        await ingestFiles(files);
      },
    };
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
