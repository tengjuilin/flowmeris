import mathjax3 from 'markdown-it-mathjax3';
import { defineConfig } from 'vitepress';

// The docs are the site's landing page; the app is served beside them at <base>app/.
// DOCS_BASE overrides the base, e.g. "/flowmeris/" on GitHub Pages.
export default defineConfig({
  title: 'Flowmeris',
  description: 'Client-side flow cytometry analysis — user guide, methods and validation',
  base: process.env.DOCS_BASE ?? '/',
  cleanUrls: false,
  // The app is not a VitePress page; links to it are checked by the e2e tests instead.
  ignoreDeadLinks: [/(^|\/)app\/$/],
  markdown: { config: (md) => md.use(mathjax3) },
  // MathJax emits <mjx-*> elements; Vue must not treat them as components.
  vue: { template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('mjx-') } } },
  themeConfig: {
    nav: [
      // target makes the link a full page load: the VitePress router would otherwise 404 on /app/.
      { text: 'Open app', link: '/app/', target: '_self' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Methods', link: '/methods/' },
      { text: 'Validation', link: '/validation/' },
      { text: 'Decisions', link: '/adr/' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Groups and overrides', link: '/guide/groups' },
            { text: 'Gating', link: '/guide/gating' },
            { text: 'Axes and scales', link: '/guide/axes' },
            { text: 'Sample variables and plate maps', link: '/guide/metadata' },
            { text: 'Statistics tables and charts', link: '/guide/charts' },
            { text: 'Exports and reporting', link: '/guide/exports' },
            { text: 'Privacy and storage', link: '/guide/privacy' },
          ],
        },
      ],
      '/methods/': [
        {
          text: 'Methods',
          items: [
            { text: 'Overview', link: '/methods/' },
            { text: 'FCS parsing', link: '/methods/fcs' },
            { text: 'Compensation', link: '/methods/compensation' },
            { text: 'Transforms', link: '/methods/transforms' },
            { text: 'Gating', link: '/methods/gating' },
            { text: 'Statistics', link: '/methods/statistics' },
            { text: 'Plots', link: '/methods/plots' },
            { text: 'Exports', link: '/methods/exports' },
            { text: 'Workspace format', link: '/methods/workspace' },
          ],
        },
      ],
      '/adr/': [
        {
          text: 'Architecture decisions',
          items: [
            { text: 'Overview', link: '/adr/' },
            { text: '0001 CPU rasterisation', link: '/adr/0001-cpu-rasterisation' },
            { text: '0002 Float64 arithmetic', link: '/adr/0002-float64-arithmetic' },
            { text: '0003 Worker pool', link: '/adr/0003-worker-pool' },
            { text: '0004 Content-addressed caching', link: '/adr/0004-content-addressed-caching' },
            { text: '0005 Gate transform space', link: '/adr/0005-gate-transform-space' },
            { text: '0006 TypeScript kernels', link: '/adr/0006-typescript-kernels' },
            { text: '0007 Local-only data', link: '/adr/0007-local-only-data' },
            { text: '0008 Web app layering', link: '/adr/0008-web-layout-and-layering' },
            { text: '0009 Store commands', link: '/adr/0009-store-commands' },
            { text: '0010 Worker API', link: '/adr/0010-worker-api' },
            { text: '0011 Bundled figure fonts', link: '/adr/0011-bundled-figure-fonts' },
          ],
        },
      ],
    },
    footer: { message: 'All analysis runs in your browser; data never leave your machine.' },
  },
});
