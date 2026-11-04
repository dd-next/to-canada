/**
 * Job-board adapter boundary.
 *
 * Every board implements JobBoardAdapter. Boards without a permitted live feed
 * only provide external search links (built from URL templates that were
 * verified against the live site and recorded in public/data/job_search.json).
 * Boards with a permitted feed may also implement fetchPostings(); postings
 * must keep "accepts foreign applicants", LMIA status and relocation assistance
 * as separate, explicitly sourced facts (null = unknown).
 *
 * To add a board later: implement JobBoardAdapter, register it in ADAPTERS.
 */
import type { JobPosting, Place } from '../types/contract';

export interface JobSearchQuery {
  noc?: string;
  occupationTitle?: string;
  place?: Place;
}

export interface JobSearchLink {
  boardId: string;
  label: string;
  description: string;
  url: string;
  /** ISO date the URL pattern was checked against the live site, if it was. */
  verifiedAt?: string;
}

export interface JobBoardAdapter {
  id: string;
  label: string;
  links(q: JobSearchQuery, config: JobSearchConfig | undefined): JobSearchLink[];
  fetchPostings?(q: JobSearchQuery, signal?: AbortSignal): Promise<JobPosting[]>;
}

/** Shape of public/data/job_search.json (written by the work pipeline). */
export interface JobSearchConfig {
  retrievedAt: string;
  /** Board-specific location ids, e.g. Job Bank's city id per place (looked up once, verified). */
  placeLocations?: Record<string, { label: string; jbCityId?: string }>;
  /** Whether a permitted live feed of current postings exists, with the reason. */
  feedStatus?: { currentPostingsFeed: 'none_permitted' | 'available' | string; explanation: string };
  boards: {
    id: string;
    label: string;
    templates: {
      id: string;
      label: string;
      description: string;
      /** Template with {query}, {location}, {noc}, {province} placeholders, or a fixed URL. */
      urlTemplate: string;
      verifiedAt?: string;
      notes?: string;
    }[];
  }[];
}

const enc = encodeURIComponent;

function fill(template: string, q: JobSearchQuery, config?: JobSearchConfig): string | null {
  const loc = q.place ? config?.placeLocations?.[q.place.id] : undefined;
  const values: Record<string, string | undefined> = {
    query: q.occupationTitle,
    noc: q.noc,
    location: q.place ? `${q.place.name}, ${q.place.province}` : undefined,
    // Job Bank expects its own location label alongside its city id.
    city: loc?.label ?? q.place?.name,
    province: q.place?.province,
    jbCityId: loc?.jbCityId,
  };
  let missing = false;
  const url = template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = values[k];
    if (!v) missing = true;
    return v ? enc(v) : '';
  });
  return missing ? null : url;
}

/** Job Bank (ESDC). Links only: no permitted bulk feed of current postings is used in this version. */
export const jobBankAdapter: JobBoardAdapter = {
  id: 'jobbank',
  label: 'Job Bank — Government of Canada',
  links(q, config) {
    const board = config?.boards.find((b) => b.id === 'jobbank');
    const out: JobSearchLink[] = [];
    for (const t of board?.templates ?? []) {
      const url = fill(t.urlTemplate, q, config);
      if (url) out.push({ boardId: 'jobbank', label: t.label, description: t.description, url, verifiedAt: t.verifiedAt });
    }
    if (!out.some((l) => l.url.startsWith('https://www.jobbank.gc.ca/findajob/foreign-candidates'))) {
      out.unshift({
        boardId: 'jobbank',
        label: 'Job Bank for foreign candidates',
        description: 'Official Government of Canada guidance and job search for candidates outside Canada.',
        url: 'https://www.jobbank.gc.ca/findajob/foreign-candidates',
      });
    }
    return out;
  },
};

export const ADAPTERS: JobBoardAdapter[] = [jobBankAdapter];

export function jobSearchLinks(q: JobSearchQuery, config?: JobSearchConfig): JobSearchLink[] {
  return ADAPTERS.flatMap((a) => a.links(q, config));
}
