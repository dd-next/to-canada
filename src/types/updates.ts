/** Official IRCC publications. Dates describe the publication, never an inferred eligibility date. */
export type IRCCUpdateType = 'news' | 'program_delivery' | 'express_entry';

export interface IRCCUpdate {
  id: string;
  type: IRCCUpdateType;
  title: string;
  description?: string;
  /** Official newsroom subtype, such as news releases or backgrounders. */
  publicationType?: string;
  /** When this pipeline observed a content change, not a publisher date. */
  contentChangedAt?: string;
  publishedAt: string;
  updatedAt?: string;
  effectiveDate?: string;
  topics: string[];
  audience?: string;
  programIds: string[];
  url: string;
  sourceId: string;
  firstSeenAt: string;
  lastCheckedAt: string;
  contentHash: string;
  draw?: {
    round: string;
    date: string;
    category: string;
    invitations: number;
    crsCutoff: number;
    tieBreaking?: string;
  };
}

export interface IRCCUpdateSource {
  id: string;
  label: string;
  url: string;
  status: 'ok' | 'failed';
  lastCheckedAt: string;
  lastSuccessfulCheckAt: string | null;
  error?: string;
  coverageStart: string | null;
  coverageEnd: string | null;
  count: number;
}

export interface IRCCUpdatesFeed {
  schemaVersion: 1;
  generatedAt: string;
  entries: IRCCUpdate[];
  sources: IRCCUpdateSource[];
}
