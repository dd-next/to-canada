/** Published by pipeline/lmia. Each partition represents one canonical, non-overlapping period. */
export interface LmiaPeriod {
  id: string;
  label: string;
  start: string;
  end: string;
  kind: string;
  indexPath: string;
  rowCount: number;
  resourceId: string;
  status: string;
  indexBytes?: number;
}

export interface LmiaResource {
  id: string;
  name: string;
  url: string;
  format: string;
  language: string;
  revision: string | null;
  retrievedAt: string | null;
  sha256: string | null;
  status: string;
  rows: number;
  period: Pick<LmiaPeriod, 'id' | 'label' | 'start' | 'end' | 'kind'> | null;
  notes: string[];
  error?: string;
}

export interface LmiaMetadata {
  schemaVersion: 1;
  dataset: {
    id: string;
    title: string;
    url: string;
    publisher: string;
    licence: { name: string; url: string };
  };
  generatedAt: string;
  lastAttemptAt: string;
  lastSuccessfulCheckAt: string | null;
  lastSuccessfulUpdateAt: string | null;
  status: 'ok' | 'partial' | 'failed';
  runUrl?: string | null;
  error?: string;
  catalogue?: { status: string; checkedAt?: string | null; lastSuccessfulCheckAt?: string | null; lastAttemptAt?: string; error?: string; discoverySource?: string; discoveryNote?: string };
  coverage: {
    start: string | null;
    end: string | null;
    rowCount: number;
    periodCount: number;
    gaps: { start: string; end: string; reason: string }[];
    notes: string[];
  };
  periods: LmiaPeriod[];
  resources: LmiaResource[];
  excludedResources: { id: string; name: string; url: string; reason: string }[];
  facets: { provinces: { code: string; label: string }[]; nocVersions: string[]; streams: string[] };
}

export interface LmiaPartition {
  schemaVersion: 1;
  resourceId: string;
  periodId: string;
  columns: string[];
  rows: (string | number | null)[][];
}

export interface LmiaRow {
  id: string;
  employer: string;
  address: string | null;
  province: string | null;
  provinceLabel: string | null;
  stream: string | null;
  occupationCode: string | null;
  occupationTitle: string | null;
  nocVersion: string | null;
  approvedLmias: number | null;
  approvedPositions: number | null;
  employerLocationId: string;
  incorporation: string | null;
  periodId: string;
  resourceId: string;
}

export interface LmiaFilters {
  query: string;
  province: string;
  occupation: string;
  nocVersion: string;
  stream: string;
  location: string;
  employerLocationId: string;
  recordId: string;
}
