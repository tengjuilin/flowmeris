import { defineWorkspace } from 'vitest/config';

// `pnpm test` runs every project; `pnpm test:golden` runs only the golden one.
export default defineWorkspace([
  {
    // Colocated unit tests: src/**/*.test.ts next to the code they test.
    extends: './vitest.config.ts',
    test: { name: 'unit', include: ['packages/*/src/**/*.test.ts', 'apps/web/src/**/*.test.ts'] },
  },
  {
    // Cross-package checks against reference values in fixtures/golden (FlowKit, NumPy, SciPy).
    extends: './vitest.config.ts',
    test: { name: 'golden', include: ['packages/*/test/**/*.test.ts'] },
  },
  {
    // Component tests: apps/web/src/**/*.test.tsx, rendered in jsdom with Testing Library.
    extends: './vitest.config.ts',
    test: {
      name: 'dom',
      include: ['apps/web/src/**/*.test.tsx'],
      environment: 'jsdom',
      setupFiles: ['./vitest.dom-setup.ts'],
    },
  },
]);
