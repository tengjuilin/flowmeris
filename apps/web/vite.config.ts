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
 * talk to its own origin, so analyzed data cannot leave the browser. Not
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

/**
 * Dev only: mirror the deployed layout (docs at /, app at /app/) by starting
 * `vitepress dev` alongside Vite and proxying every path outside /app/ to it.
 */
function docsDev(): Plugin {
  let docsPort = 5175;
  return {
    name: 'flowmeris-docs-dev',
    apply: 'serve',
    config: (cfg, env) => {
      if (env.isPreview) return;
      // Two ports above Vite's (5175 by default), so parallel dev servers don't collide.
      docsPort = (cfg.server?.port ?? 5173) + 2;
      return {
        server: {
          proxy: {
            '^/(?!app(/|$))': { target: `http://localhost:${docsPort}`, ws: true, changeOrigin: true },
          },
        },
      };
    },
    configureServer(server) {
      const root = fileURLToPath(new URL('../..', import.meta.url));
      const child = spawn(
        'corepack',
        ['pnpm', 'exec', 'vitepress', 'dev', 'docs', '--port', String(docsPort), '--strictPort'],
        { cwd: root, stdio: 'ignore', env: { ...process.env, DOCS_BASE: '/' } },
      );
      const stop = () => child.kill();
      server.httpServer?.once('close', stop);
      process.once('exit', stop);
    },
  };
}

export default defineConfig(({ command, isPreview }) => ({
  // Dev mirrors the site (/app/); builds are relative so they work under any prefix
  // (/app/, /<repo>/app/, or / when `vite preview` serves them for e2e).
  base: command === 'serve' && !isPreview ? '/app/' : './',
  plugins: [react(), csp(), docsDev()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
  server: { port: 5173 },
}));
