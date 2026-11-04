import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';

/**
 * Dev-only: serve synthetic fixtures from dev/fixtures at /__fixtures/ so the
 * interface can be developed before real snapshots exist. Activated only with
 * VITE_DATA_BASE=/__fixtures/ in `vite` dev mode. Never part of a build.
 */
function devFixtures(): Plugin {
  return {
    name: 'northward-dev-fixtures',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__fixtures/', (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
        const file = join(process.cwd(), 'dev', 'fixtures', rel);
        if (!existsSync(file)) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(readFileSync(file));
      });
    },
  };
}

// BASE_PATH lets the static build be served from a sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), devFixtures()],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
