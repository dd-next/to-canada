import type { ProgramRecord } from '../../types/contract';

/** Editorial navigation over the publisher-derived program categories. */
export const PROGRAM_GROUPS = [
  { id: '', label: 'All', categories: [] },
  { id: 'federal', label: 'Federal', categories: ['federal_economic'] },
  { id: 'provincial', label: 'Provincial & territorial', categories: ['provincial_nominee'] },
  { id: 'quebec', label: 'Quebec', categories: ['quebec'] },
  { id: 'community', label: 'Community pilots', categories: ['community_pilot'] },
  { id: 'atlantic', label: 'Atlantic', categories: ['atlantic'] },
  { id: 'support', label: 'Newcomer support', categories: ['pre_arrival', 'settlement_support'] },
] as const;

export function programInGroup(program: Pick<ProgramRecord, 'category'>, group: string): boolean {
  const selected = PROGRAM_GROUPS.find((item) => item.id === group);
  return !selected || selected.id === '' || (selected.categories as readonly string[]).includes(program.category);
}

export function programGroupHref(search: string, group: string, hash = ''): string {
  const params = new URLSearchParams(search);
  if (group) params.set('group', group); else params.delete('group');
  // A selected detail is an entry point, not a hidden constraint on the next group.
  params.delete('program');
  const query = params.toString();
  return `/immigration/programs${query ? `?${query}` : ''}${hash}`;
}
