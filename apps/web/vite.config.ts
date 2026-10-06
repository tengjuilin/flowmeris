import { execSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { type Plugin, defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};
let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  /* not a git checkout */
}

/**
 * Content-Security-Policy for production builds (ADR-0007): the page may only
 * talk to its own origin, so analysed data cannot leave the browser. Not
 * applied in dev because Vite's HMR client relies on inline scripts.
 */
function csp(): Plugin {
  return {
    name: 'flowmeris-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const policy = [
        "default-src 'self'",
        "script-src 'self' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "worker-src 'self' blob:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; ');
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

const DOCS_DEV_PORT = 5175;

/**
 * Dev only: serve the VitePress docs at /docs/ (as in the built site) by
 * starting `vitepress dev` alongside Vite and proxying to it. Without this the
 * SPA fallback answers /docs/ with the app itself.
 */
function docsDev(): Plugin {
  return {
    name: 'flowmeris-docs-dev',
    apply: 'serve',
    config: () => ({
      server: {
        proxy: {
          '/docs': { target: `http://localhost:${DOCS_DEV_PORT}`, ws: true, changeOrigin: true },
        },
      },
    }),
    configureServer(server) {
      const root = fileURLToPath(new URL('../..', import.meta.url));
      const child = spawn(
        'corepack',
        ['pnpm', 'exec', 'vitepress', 'dev', 'docs', '--port', String(DOCS_DEV_PORT), '--strictPort'],
        { cwd: root, stdio: 'ignore', env: { ...process.env, DOCS_BASE: '/docs/' } },
      );
      const stop = () => child.kill();
      server.httpServer?.once('close', stop);
      process.once('exit', stop);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), csp(), docsDev()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
  server: { port: 5173 },
});
