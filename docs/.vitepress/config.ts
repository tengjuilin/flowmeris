import mathjax3 from 'markdown-it-mathjax3';
import { defineConfig } from 'vitepress';

// Served under the app at ./docs/ (DOCS_BASE overrides, e.g. "/flowmeris/docs/" on GitHub Pages).
export default defineConfig({
  title: 'flowmeris',
  description: 'Client-side flow cytometry analysis — user guide, methods and validation',
  base: process.env.DOCS_BASE ?? '/docs/',
  cleanUrls: false,
  markdown: { config: (md) => md.use(mathjax3) },
  themeConfig: {
    nav: [
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
      '/adr/': [{ text: 'Architecture decisions', link: '/adr/' }],
    },
    footer: { message: 'All analysis runs in your browser; data never leave your machine.' },
  },
});
