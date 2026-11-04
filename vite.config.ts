import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH lets the static build be served from a sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
