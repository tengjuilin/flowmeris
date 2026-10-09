import { defineConfig } from 'vitest/config';

// Shared settings. The test projects (unit, golden) and their file globs are in vitest.workspace.ts.
export default defineConfig({
  // Build-time constants of the web app (apps/web/vite.config.ts), for tests that import its store.
  define: { __APP_VERSION__: JSON.stringify('test'), __APP_COMMIT__: JSON.stringify('test') },
  test: {
    environment: 'node',
    testTimeout: 30_000,
  },
});
