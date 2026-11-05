// Post-build: make client-side routes load with HTTP 200 on static hosts.
// - dist/404.html: fallback for any unknown path (still renders the app).
// - dist/<route>.html for every known route (GitHub Pages serves /x from x.html),
//   so shared links such as /place/toronto return 200 instead of the 404 fallback.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dist = 'dist';
const index = join(dist, 'index.html');
if (existsSync(index)) {
  copyFileSync(index, join(dist, '404.html'));
  const read = (p) => {
    try {
      return JSON.parse(readFileSync(p, 'utf8'));
    } catch {
      return [];
    }
  };
  const routes = ['compare', 'budget', 'insights', 'immigration', 'updates', 'sources', 'about'];
  for (const p of read('public/data/places.json')) routes.push(`place/${p.id}`);
  for (const i of read('public/data/insights/index.json')) routes.push(`insights/${i.id}`);
  for (const r of routes) {
    const file = join(dist, `${r}.html`);
    mkdirSync(dirname(file), { recursive: true });
    copyFileSync(index, file);
  }
  console.log(`spa-fallback: 404.html + ${routes.length} route entry pages`);
}
