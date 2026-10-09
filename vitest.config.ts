import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Build-time constants of the web app (apps/web/vite.config.ts), for tests that import its store.
  define: { __APP_VERSION__: JSON.stringify('test'), __APP_COMMIT__: JSON.stringify('test') },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
