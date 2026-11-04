// Copies dist/index.html to dist/404.html so static hosts serve client-side routes.
import { copyFileSync, existsSync } from 'node:fs';
if (existsSync('dist/index.html')) copyFileSync('dist/index.html', 'dist/404.html');
