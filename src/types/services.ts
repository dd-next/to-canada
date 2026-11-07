export type ServiceCoverageKind = 'national' | 'provincial_territorial' | 'regional' | 'municipal' | 'agency' | 'unmapped';

export interface ServiceEntry {
  id: string;
  name: string;
  description: string;
  url: string;
  tags: string[];
  category: string;
  level: string;
  jurisdiction: string;
  type: string;
  dateAdded?: string;
  kind?: string;
  sourceRecord: Record<string, unknown>;
  source: { id: string; url: string; commit: string; recordIndex: number };
  contentHash: string;
  firstSeenAt: string;
  contentChangedAt: string;
  state: 'current' | 'retired';
  retiredAt: string | null;
  coverage: { kind: ServiceCoverageKind; label: string; sourceLevel: string; sourceJurisdiction: string };
}

export interface ServicesCatalogue {
  schemaVersion: 1;
  meta: {
    source: { id: string; name: string; repositoryUrl: string; siteUrl: string; catalogueUrl: string; commit: string | null; contentHash: string | null };
    attribution: string;
    license: { name: string; copyright: string; url: string; localPath: string };
    firstImportedAt: string | null;
    lastAttemptedAt: string | null;
    lastSuccessfulCheckAt: string | null;
    lastSuccessfulContentUpdateAt: string | null;
    status: 'updated' | 'no_changes' | 'failed';
    error: string | null;
    lastAttemptCounts?: { input: number; valid: number; quarantined: number } | null;
    counts: { input: number; current: number; retired: number; quarantined: number; categories: number; jurisdictions: number };
    categories: string[];
    jurisdictions: string[];
    levels: string[];
    coverageKinds: ServiceCoverageKind[];
    warnings: string[];
  };
  entries: ServiceEntry[];
}

export type ServiceChangeKind = 'added' | 'edited' | 'retired' | 'restored';
export interface ServiceChange {
  id: string;
  name: string;
  type: ServiceChangeKind;
  fields: string[];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}
export interface ServicesHistory {
  schemaVersion: 1;
  events: {
    id: string;
    type: 'initial_import' | 'changes';
    at: string;
    sourceCommit: string;
    runUrl?: string | null;
    counts: Record<ServiceChangeKind, number>;
    changes: ServiceChange[];
  }[];
  runs: {
    id: string;
    at: string;
    status: 'updated' | 'no_changes' | 'failed';
    sourceCommit: string | null;
    counts: Record<string, number>;
    error: string | null;
    runUrl: string | null;
  }[];
}
