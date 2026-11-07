import type { LmiaFilters, LmiaPartition, LmiaPeriod, LmiaRow } from '../../types/lmia';

export const LMIA_PAGE_SIZE = 30;
export const UNREPORTED = '__unreported__';
export const LMIA_QUERY_KEYS = ['q', 'province', 'period', 'occupation', 'nocVersion', 'stream', 'location', 'employerLocation', 'record', 'page'] as const;

export function normalizeLmia(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-CA').replace(/\s+/g, ' ').trim();
}

export function safeSourceUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : undefined;
  } catch { return undefined; }
}

const COLUMNS = ['id', 'employer', 'address', 'province', 'provinceLabel', 'stream', 'occupationCode', 'occupationTitle', 'nocVersion', 'approvedLmias', 'approvedPositions', 'employerLocationId', 'incorporation'];

/** Reject a mismatched partition instead of displaying stale or incomplete totals. */
export function decodeLmiaPartition(partition: LmiaPartition, period: LmiaPeriod): LmiaRow[] {
  if (partition.schemaVersion !== 1 || partition.periodId !== period.id || partition.resourceId !== period.resourceId
      || !Array.isArray(partition.columns) || !Array.isArray(partition.rows) || partition.rows.length !== period.rowCount) {
    throw new Error('The reporting-period snapshot does not match its coverage record.');
  }
  const columns = new Map(partition.columns.map((name, index) => [name, index]));
  if (COLUMNS.some((column) => !columns.has(column))) throw new Error('The reporting-period snapshot has an unsupported layout.');
  const seen = new Set<string>();
  return partition.rows.map((values) => {
    const text = (column: string, required = false): string | null => {
      const value = values[columns.get(column)!];
      if (value === null && !required) return null;
      if (typeof value !== 'string' || (required && !value)) throw new Error(`An LMIA record has an invalid ${column}.`);
      return value;
    };
    const count = (column: string): number | null => {
      const value = values[columns.get(column)!];
      if (value === null) return null;
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('An LMIA count is invalid.');
      return value;
    };
    const id = text('id', true)!;
    if (seen.has(id)) throw new Error('The reporting-period snapshot contains duplicate record identifiers.');
    seen.add(id);
    return {
      id, employer: text('employer', true)!, address: text('address'), province: text('province'), provinceLabel: text('provinceLabel'),
      stream: text('stream'), occupationCode: text('occupationCode'), occupationTitle: text('occupationTitle'), nocVersion: text('nocVersion'),
      approvedLmias: count('approvedLmias'), approvedPositions: count('approvedPositions'), employerLocationId: text('employerLocationId', true)!,
      incorporation: text('incorporation'), periodId: period.id, resourceId: period.resourceId,
    };
  });
}

export type SearchableLmiaRow = LmiaRow & { searchEmployer: string; searchLocation: string; searchOccupation: string };
export function prepareLmiaRows(rows: LmiaRow[]): SearchableLmiaRow[] {
  return rows.map((row) => ({ ...row, searchEmployer: normalizeLmia(row.employer), searchLocation: normalizeLmia(row.address ?? ''), searchOccupation: normalizeLmia(`${row.occupationCode ?? ''} ${row.occupationTitle ?? ''}`) }));
}

const terms = (value: string) => normalizeLmia(value).split(' ').filter(Boolean);
const matchesField = (actual: string | null, expected: string) => !expected || (expected === UNREPORTED ? !actual : actual === expected);

/** Pagination is deliberately downstream of filtering and aggregation. */
export function filterLmiaRows(rows: SearchableLmiaRow[], filters: LmiaFilters): SearchableLmiaRow[] {
  const employer = terms(filters.query), location = terms(filters.location), occupation = terms(filters.occupation);
  return rows.filter((row) => {
    if (filters.employerLocationId && row.employerLocationId !== filters.employerLocationId) return false;
    if (filters.recordId && row.id !== filters.recordId) return false;
    if (!matchesField(row.province, filters.province) || !matchesField(row.nocVersion, filters.nocVersion) || !matchesField(row.stream, filters.stream)) return false;
    return employer.every((word) => row.searchEmployer.includes(word)) && location.every((word) => row.searchLocation.includes(word)) && occupation.every((word) => row.searchOccupation.includes(word));
  });
}

export function readLmiaFilters(params: URLSearchParams): LmiaFilters {
  return { query: params.get('q') ?? '', province: params.get('province') ?? '', occupation: params.get('occupation') ?? '', nocVersion: params.get('nocVersion') ?? '', stream: params.get('stream') ?? '', location: params.get('location') ?? '', employerLocationId: params.get('employerLocation') ?? '', recordId: params.get('record') ?? '' };
}

export function periodSelection(periods: LmiaPeriod[], requested: string | null, history: boolean): LmiaPeriod[] {
  const sorted = [...periods].sort((a, b) => b.end.localeCompare(a.end) || b.start.localeCompare(a.start));
  if (requested === 'all' || (history && !requested)) return sorted;
  return requested ? sorted.filter((period) => period.id === requested) : sorted.slice(0, 1);
}

export function periodsOverlap(periods: LmiaPeriod[]): boolean {
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.some((period, index) => index > 0 && period.start <= sorted[index - 1].end);
}

export interface LmiaSummary {
  rows: number;
  locations: number;
  lmias: { known: number; unknown: number };
  positions: { known: number; unknown: number };
  overlappingPeriods: boolean;
  nocVersions: string[];
}

export function summarizeLmiaRows(rows: LmiaRow[], periods: LmiaPeriod[]): LmiaSummary {
  const matchingPeriodIds = new Set(rows.map((row) => row.periodId));
  const summary: LmiaSummary = { rows: rows.length, locations: new Set(rows.map((row) => row.employerLocationId)).size, lmias: { known: 0, unknown: 0 }, positions: { known: 0, unknown: 0 }, overlappingPeriods: periodsOverlap(periods.filter((period) => matchingPeriodIds.has(period.id))), nocVersions: [...new Set(rows.map((row) => row.nocVersion ?? 'Not reported'))].sort() };
  for (const row of rows) {
    if (row.approvedLmias === null) summary.lmias.unknown++; else summary.lmias.known += row.approvedLmias;
    if (row.approvedPositions === null) summary.positions.unknown++; else summary.positions.known += row.approvedPositions;
  }
  return summary;
}

export function pageNumber(raw: string | null, rowCount: number): number {
  const number = raw && /^\d+$/.test(raw) ? Number(raw) : 1;
  return Math.min(Math.max(1, Number.isSafeInteger(number) ? number : 1), Math.max(1, Math.ceil(rowCount / LMIA_PAGE_SIZE)));
}

export function employerHistoryHref(row: LmiaRow): string {
  return `/immigration/lmia?${new URLSearchParams({ employerLocation: row.employerLocationId, period: 'all' })}`;
}

export function recordHref(row: LmiaRow): string {
  return `/immigration/lmia?${new URLSearchParams({ period: row.periodId, record: row.id })}`;
}
