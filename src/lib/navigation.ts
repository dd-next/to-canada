/** Carry reproducible public controls and an already-shared scenario between pages.
 * Never adds private localStorage amounts to a URL implicitly.
 */
export function withNavigationContext(to: string, current: URLSearchParams): string {
  const [path, query = ''] = to.split('?');
  if (!['/', '/compare', '/budget'].includes(path) && !path.startsWith('/place/')) return to;
  const next = new URLSearchParams(query);
  for (const key of ['noc', 'unit']) if (!next.has(key) && current.has(key)) next.set(key, current.get(key)!);
  if (path === '/compare' && !next.has('compare') && current.has('compare')) next.set('compare', current.get('compare')!);
  if (path === '/budget' && !next.has('place') && current.has('place')) next.set('place', current.get('place')!);
  if (['/compare', '/budget'].includes(path) && current.has('scenario')) {
    for (const [key, value] of current) {
      if ((['scenario', 'hh', 'income', 'savings', 'rent', 'place'].includes(key) || /^(m|u|o)_/.test(key)) && !next.has(key)) next.set(key, value);
    }
  }
  const suffix = next.toString();
  return path + (suffix ? `?${suffix}` : '');
}
