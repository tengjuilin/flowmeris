// Import boundaries, checked by `pnpm lint:deps` (dependency-cruiser). Layering is described in
// CLAUDE.md and ADR-0008. Violations that existed when a rule was added are listed in
// .dependency-cruiser-known-violations.json and are being removed; new ones fail the check.
const fs = require('node:fs');
const path = require('node:path');

const TEST_FILE = '(\\.test\\.tsx?$|/test/|/bench/)';

// Each workspace package (and the web app) may import only the @flowmeris packages its package.json
// declares: `dependencies` from production code, plus `devDependencies` from tests and benchmarks.
function manifestRules() {
  const dirs = [...fs.readdirSync('packages').map((d) => ['packages', d]), ['apps', 'web']];
  const all = fs.readdirSync('packages');
  const rules = [];
  for (const [root, dir] of dirs) {
    const pkgFile = path.join(root, dir, 'package.json');
    if (!fs.existsSync(pkgFile)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    const names = (deps) => Object.keys(deps ?? {}).map((n) => n.replace('@flowmeris/', ''));
    const prod = new Set([...names(pkg.dependencies), root === 'packages' ? dir : '']);
    const dev = new Set([...prod, ...names(pkg.devDependencies)]);
    const notIn = (allowed) => all.filter((p) => !allowed.has(p));
    const from = `^${root}/${dir}/`;
    if (notIn(prod).length) {
      rules.push({
        name: `undeclared-dep:${dir}`,
        comment: `${pkg.name} imports a workspace package not listed in its package.json dependencies`,
        severity: 'error',
        from: { path: from, pathNot: TEST_FILE },
        to: { path: `^packages/(${notIn(prod).join('|')})/` },
      });
    }
    if (notIn(dev).length) {
      rules.push({
        name: `undeclared-dev-dep:${dir}`,
        comment: `${pkg.name} tests import a workspace package not listed in its package.json`,
        severity: 'error',
        from: { path: `${from}.*${TEST_FILE}` },
        to: { path: `^packages/(${notIn(dev).join('|')})/` },
      });
    }
  }
  return rules;
}

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'packages-not-to-apps',
      comment: 'Packages are app-independent libraries; they never import from apps/.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'package-internals',
      comment: 'Import another package through its name (its src/index.ts), not by a path into its files.',
      severity: 'error',
      from: { path: '^(packages|apps)/([^/]+)/' },
      to: { path: '^packages/([^/]+)/src/(?!index\\.ts$)', pathNot: '^packages/$2/' },
    },
    {
      name: 'web-lib-is-pure',
      comment:
        'apps/web/src/lib holds pure, node-testable logic: no store, worker pool, workers or React components.',
      severity: 'error',
      from: { path: '^apps/web/src/lib/' },
      to: { path: '^apps/web/src/(components|features|state|engine-client|workers|app)/' },
    },
    {
      name: 'web-state-below-ui',
      comment: 'apps/web/src/state (store, commands, data hooks) is used by the UI and does not import it.',
      severity: 'error',
      from: { path: '^apps/web/src/state/' },
      to: { path: '^apps/web/src/(components|features|app)/' },
    },
    {
      name: 'web-ui-is-presentational',
      comment:
        'components/ui holds generic controls (inputs, icons, sections, menus): they get data and callbacks as props and import only lib/, hooks and each other.',
      severity: 'error',
      from: { path: '^apps/web/src/components/ui/' },
      to: {
        path: '^apps/web/src/',
        pathNot: '^apps/web/src/(components/(ui|hooks)/|lib/)',
      },
    },
    {
      name: 'web-hooks-are-generic',
      comment: 'components/hooks are DOM and timing hooks with no knowledge of the store or the views.',
      severity: 'error',
      from: { path: '^apps/web/src/components/hooks/' },
      to: { path: '^apps/web/src/', pathNot: '^apps/web/src/(components/hooks/|lib/)' },
    },
    {
      name: 'web-controls-below-views',
      comment:
        'components/controls are settings controls shared by several views; they may use the store but not import a view or a feature.',
      severity: 'error',
      from: { path: '^apps/web/src/components/controls/' },
      to: {
        path: '^apps/web/src/(components|features|app)/',
        pathNot: '^apps/web/src/components/(ui|hooks|controls)/',
      },
    },
    {
      name: 'web-components-shared-only',
      comment:
        'components/ holds only shared ui/, controls/ and hooks/: a view, its settings panel and their parts go in features/<name>/.',
      severity: 'error',
      from: { path: '^apps/web/src/components/[^/]+$' },
      to: {},
    },
    {
      name: 'web-settings-kit-api',
      comment:
        'The settings panel kit (components/ui/settings) and the text cards (components/controls/text) are used through their index.ts, so every panel uses the same parts.',
      severity: 'error',
      from: { pathNot: '^apps/web/src/components/(ui/settings|controls/text)/' },
      to: { path: '^apps/web/src/components/(ui/settings|controls/text)/(?!index\\.ts$)' },
    },
    {
      name: 'web-text-through-cards',
      comment:
        'A settings panel styles text with BaseFontCard and TextCards (components/controls/text), not with their parts.',
      severity: 'error',
      from: { path: '^apps/web/src/features/' },
      to: { path: '^apps/web/src/components/controls/(TextStyleEditor|FontSelect)\\.tsx$' },
    },
    {
      name: 'web-feature-public-api',
      comment: 'A feature folder is used through its index.ts; only its own files import its other files.',
      severity: 'error',
      from: { path: '^apps/web/src/', pathNot: '^apps/web/src/features/' },
      to: { path: '^apps/web/src/features/[^/]+/(?!index\\.ts$)' },
    },
    {
      name: 'web-feature-to-feature',
      comment: 'A feature uses another feature through its index.ts.',
      severity: 'error',
      from: { path: '^apps/web/src/features/([^/]+)/' },
      to: { path: '^apps/web/src/features/[^/]+/(?!index\\.ts$)', pathNot: '^apps/web/src/features/$1/' },
    },
    {
      name: 'web-app-on-top',
      comment: 'apps/web/src/app (shell, view registry) is the top layer: only main.tsx imports it.',
      severity: 'error',
      from: { path: '^apps/web/src/', pathNot: '^apps/web/src/(app/|main\\.tsx$)' },
      to: { path: '^apps/web/src/app/' },
    },
    ...manifestRules(),
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(node_modules|dist|fixtures|docs|test-results|playwright-report)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
  },
};
