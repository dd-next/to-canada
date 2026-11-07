import type { ServiceCoverageKind, ServiceEntry } from '../../types/services';

export const SERVICES_PAGE_SIZE = 24;
export const SERVICE_FILTER_KEYS = ['svcQ', 'svcCategory', 'svcJurisdiction', 'svcCoverage', 'svcState', 'svcPage', 'service'] as const;
export const COVERAGE_LABELS: Record<ServiceCoverageKind, string> = {
  national: 'National', provincial_territorial: 'Provincial / territorial',
  regional: 'Regional', municipal: 'Municipal', agency: 'Agency coverage', unmapped: 'Source-specific coverage',
};
export const normalizeServiceText = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();

/** Only absolute HTTP(S) destinations are links; imported text never becomes markup. */
export function safeServiceUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export interface ServiceFilters { query: string; category: string; jurisdiction: string; coverage: string; state: string; }
export function readServiceFilters(params: URLSearchParams): ServiceFilters {
  return { query: params.get('svcQ') ?? '', category: params.get('svcCategory') ?? '', jurisdiction: params.get('svcJurisdiction') ?? '', coverage: params.get('svcCoverage') ?? '', state: params.get('svcState') === 'retired' ? 'retired' : params.get('svcState') === 'all' ? 'all' : 'current' };
}

export function filterServices(entries: ServiceEntry[], filters: ServiceFilters): ServiceEntry[] {
  const words = normalizeServiceText(filters.query).split(' ').filter(Boolean);
  return entries.filter((entry) => {
    if (filters.state !== 'all' && entry.state !== filters.state) return false;
    if (filters.category && entry.category !== filters.category) return false;
    if (filters.jurisdiction && entry.jurisdiction !== filters.jurisdiction) return false;
    if (filters.coverage && entry.coverage.kind !== filters.coverage) return false;
    if (!words.length) return true;
    const text = normalizeServiceText([entry.name, entry.description, entry.category, entry.jurisdiction, entry.level, entry.type, entry.kind, entry.url, ...entry.tags].filter(Boolean).join(' '));
    return words.every((word) => text.includes(word));
  }).sort((left, right) => left.name.localeCompare(right.name, 'en') || left.id.localeCompare(right.id));
}

export function boundedPage(raw: string | null, total: number, size = SERVICES_PAGE_SIZE): number {
  const requested = raw && /^\d+$/.test(raw) ? Number(raw) : 1;
  return Math.min(Math.max(1, requested), Math.max(1, Math.ceil(total / size)));
}

export function serviceHref(id: string): string { return `/services?service=${encodeURIComponent(id)}`; }

export function serviceTimestamp(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  return `${new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)} UTC`;
}
