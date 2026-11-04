/**
 * Northward shared data contract (v1).
 *
 * Every JSON file under public/data/ conforms to these types. Pipelines in
 * pipeline/ (Python) write data/processed/<domain>/*.json in the same shape,
 * and pipeline/build_app_data.py merges them into public/data/.
 *
 * Rules that apply everywhere:
 *  - Missing stays missing: value === null plus a flag explaining why. Never 0.
 *  - Every factual number carries sourceId + period + the geography it was
 *    actually measured for (geo). A Toronto-CMA value is never presented as a
 *    value for Mississauga; an economic-region value is labelled as regional.
 *  - Money is Canadian dollars. Unit strings say what the money is:
 *    CAD_hour (hourly), CAD_month, CAD_year; gross vs net and individual vs
 *    household are stated in MetricDef.basis.
 */

export type ProvinceCode =
  | 'NL' | 'PE' | 'NS' | 'NB' | 'QC' | 'ON' | 'MB' | 'SK' | 'AB' | 'BC' | 'YT' | 'NT' | 'NU';

export type RegionCode = 'west' | 'prairies' | 'ontario' | 'quebec' | 'atlantic' | 'north';

export type GeoLevel =
  | 'country'
  | 'province'
  | 'economic_region'
  | 'cma'        // census metropolitan area
  | 'ca'         // census agglomeration
  | 'cma_part'   // provincial part of a CMA (Ottawa–Gatineau)
  | 'csd'        // census subdivision (municipality)
  | 'mbm_region' // Market Basket Measure region
  | 'station'    // climate station
  | 'community'; // immigration-pilot community (program-defined)

/** A reference to the geography a statistic is actually measured for. */
export interface GeoRef {
  level: GeoLevel;
  /** Source geography code: '535' (CMA), '35505' (CMA part), '3530' (ER), '35' (PR). */
  id: string;
  /** Statistics Canada DGUID when the source provides one, e.g. '2021S0503535'. */
  dguid?: string;
  /** Official name as published by the source. */
  name: string;
  /** Boundary / classification vintage, e.g. '2021', 'ER 2021'. */
  vintage?: string;
}

export type Unit =
  | 'CAD' | 'CAD_hour' | 'CAD_month' | 'CAD_year'
  | 'percent' | 'pp'          // percent, percentage points
  | 'degC' | 'mm' | 'cm' | 'days' | 'hours'
  | 'count' | 'persons' | 'index' | 'ratio' | 'minutes' | 'km' | 'months' | 'per_1000';

/** Quality / provenance flags. Keep the source's own meaning. */
export type Flag =
  | 'suppressed'          // source suppressed (confidentiality / reliability)
  | 'not_available'       // source has no value for this cell
  | 'use_with_caution'    // e.g. StatCan quality E, CMHC 'c' / 'd'
  | 'too_unreliable'      // F / '**' — value withheld from display
  | 'preliminary'
  | 'revised'
  | 'rounded'             // source applies random rounding (census, taxfiler)
  | 'regional_value'      // value is for an economic region / broader area than the place
  | 'provincial_value'    // value is for the province
  | 'national_value'
  | 'station_proxy'       // climate station used as proxy for the place
  | 'cma_wide'            // value covers the whole CMA (e.g. both parts of Ottawa–Gatineau)
  | 'annual_wage'         // Job Bank wage published as annual rather than hourly
  | 'small_sample';

export interface Place {
  /** Stable URL slug, e.g. 'toronto'. Never changes once published. */
  id: string;
  /** Display name, e.g. 'Toronto'. */
  name: string;
  /** How statistics for this place should be described, e.g. 'Toronto CMA'. */
  statLabel: string;
  /** Province whose rules/costs apply to this place. */
  province: ProvinceCode;
  region: RegionCode;
  /** Marker position (principal municipality), WGS84 decimal degrees. */
  lat: number;
  lon: number;
  /** core = full multi-source coverage expected; extended = partial (smaller / northern places). */
  tier: 'core' | 'extended';
  geo: {
    /** The CMA or CA the place's statistics are published for. */
    cma?: GeoRef;
    /** Provincial part of a cross-border CMA (Ottawa–Gatineau). */
    cmaPart?: GeoRef;
    /** Economic regions the CMA/CA overlaps; [0] is primary (used for Job Bank wages). */
    economicRegions: GeoRef[];
    province: GeoRef;
    /** Principal municipality (CSD). */
    principalCsd?: GeoRef;
    /** MBM region used for basket thresholds, if any. */
    mbmRegion?: GeoRef;
  };
  /** Municipalities inside the CMA/CA — search aliases only, never separate statistics. */
  municipalities?: string[];
  population?: { value: number; period: string; geo: GeoRef; sourceId: string };
  climateStation?: {
    name: string;
    climateId: string;
    lat: number;
    lon: number;
    elevationM?: number;
    distanceKm: number;
    normalsPeriod: string;
    sourceId: string;
  };
  /** Immigration program tags relevant to this place, e.g. 'rcip', 'fcip', 'aip', 'quebec'. */
  programTags?: string[];
  /** One-line, data-grounded description (optional; written by the lead). */
  blurb?: string;
}

export type MetricCategory = 'housing' | 'work' | 'cost' | 'immigration' | 'climate' | 'people';

export interface MetricDef {
  /** e.g. 'rent_asking_1br' */
  id: string;
  label: string;        // 'Average asking rent, 1 bedroom'
  shortLabel: string;   // 'Asking rent, 1 bed'
  category: MetricCategory;
  unit: Unit;
  decimals: number;
  /** Direction used for colour scales and "best" sorting. */
  higherIs: 'better' | 'worse' | 'neutral';
  /** Plain-English definition shown in legends and tooltips. */
  description: string;
  /** e.g. 'gross, individual, employed workers' | 'asking (advertised) rent' */
  basis?: string;
  /** Typical geography of the statistic. Individual observations may differ (see Observation.geo). */
  geoLevel: GeoLevel;
  periodType: 'month' | 'quarter' | 'year' | 'three_month_avg' | 'census' | 'normals' | 'fiscal_year' | 'period';
  seasonalAdjustment?: 'seasonally_adjusted' | 'unadjusted' | 'not_applicable';
  priceBasis?: 'current_dollars' | 'constant_dollars';
  /** Constant-dollar base year when priceBasis === 'constant_dollars'. */
  priceBaseYear?: string;
  sourceIds: string[];
  /** Shown when values come from different methods/coverage. */
  comparabilityNote?: string;
  /** Show as a map layer. */
  mapLayer?: boolean;
  /** Dimension values that define this metric, e.g. { unitType: '1 bedroom' }. */
  dims?: Record<string, string>;
}

/** One value for one place and metric. The atomic, traceable fact. */
export interface Observation {
  placeId: string;
  metricId: string;
  /** null = missing; see flags for why. */
  value: number | null;
  /** '2025-Q3', '2025-09', '2025', '2024/2025', '1991-2020', '2021' */
  period: string;
  /** Geography the value is for — may be broader than the place (flag it). */
  geo: GeoRef;
  sourceId: string;
  flags?: Flag[];
  note?: string;
}

/** A time series for charts and history. */
export interface Series {
  id: string;
  label: string;
  unit: Unit;
  placeId?: string;
  metricId?: string;
  geo: GeoRef;
  sourceId: string;
  seasonalAdjustment?: MetricDef['seasonalAdjustment'];
  priceBasis?: MetricDef['priceBasis'];
  dims?: Record<string, string>;
  points: SeriesPoint[];
}

export interface SeriesPoint {
  /** Period label, same conventions as Observation.period. */
  t: string;
  v: number | null;
  f?: Flag[];
}

// ---------------------------------------------------------------- Occupations

export interface Occupation {
  /** NOC 2021 five-digit code, e.g. '21231'. */
  noc: string;
  title: string;
  /** TEER category 0–5. */
  teer: number;
  /** Broad occupational category digit '0'..'9' and its title. */
  broadCategory: string;
  broadTitle: string;
  /** Short list of example job titles (from the NOC index), optional. */
  examples?: string[];
}

/**
 * Job Bank wage cell: wages of employed workers in an occupation and
 * economic region (not advertised pay). Hourly unless flagged annual_wage.
 * Packed as a tuple to keep the file small: [low, median, high, flagsBitmask]
 */
export interface WageTable {
  sourceId: string;
  /** e.g. '2023-2024' as published by Job Bank */
  referencePeriod: string;
  revisionDate?: string;
  /** Dictionary of geographies used as keys below (ER codes, province codes, 'CA'). */
  geos: Record<string, GeoRef>;
  /** byNoc[noc][geoKey] = [low, median, high, isAnnual(0|1)] */
  byNoc: Record<string, Record<string, [number | null, number | null, number | null, 0 | 1]>>;
}

// ---------------------------------------------------------------- Immigration programs

export type ProgramCategory =
  | 'federal_economic'
  | 'provincial_nominee'
  | 'quebec'
  | 'community_pilot'
  | 'atlantic'
  | 'settlement_support'
  | 'pre_arrival';

export interface ProgramRecord {
  id: string;
  name: string;
  shortName?: string;
  /** 'federal' or the owning province/territory. */
  jurisdiction: 'federal' | ProvinceCode;
  /** Who runs it, e.g. 'IRCC', 'Ontario Immigrant Nominee Program (OINP)'. */
  operator: string;
  category: ProgramCategory;
  /** Parent program id for streams, e.g. stream of a PNP. */
  parentId?: string;
  purpose: string;
  audience: string;
  geography: string;
  /** Places this applies to (community pilots, regional streams). Empty = province-wide. */
  placeIds?: string[];
  majorConditions: string[];
  jobOfferRequired: 'yes' | 'no' | 'varies' | 'not_applicable' | 'unknown';
  /** Only present when verified on an official page on lastChecked. */
  status?: {
    value: 'open' | 'paused' | 'closed' | 'intake_rounds';
    note?: string;
    sourceUrl: string;
  };
  officialUrl: string;
  links?: { label: string; url: string }[];
  /** ISO date the official page was read. */
  lastChecked: string;
  sourceId: string;
}

// ---------------------------------------------------------------- Jobs (adapter boundary)

export interface JobPosting {
  id: string;
  title: string;
  employer: string | null;
  location: string;
  placeId?: string;
  noc?: string;
  postedDate: string | null;
  source: string;        // e.g. 'Job Bank'
  url: string;           // original posting
  /** Explicit statements only; null = unknown. Kept as separate facts. */
  acceptsForeignApplicants: boolean | null;
  lmiaStatus: string | null;
  relocationAssistance: boolean | null;
  wage?: string | null;
  retrievedAt: string;
}

// ---------------------------------------------------------------- Sources

export interface SourceRecord {
  /** e.g. 'statcan-46-10-0092-01' */
  id: string;
  title: string;
  publisher: string;
  /** StatCan table id, CMHC table name, dataset uuid, ... */
  tableId?: string;
  /** Human landing page. */
  url: string;
  /** Machine endpoint actually used. */
  downloadUrl?: string;
  /** Source release / last-updated date as published. */
  releaseDate?: string;
  /** When we downloaded it (ISO). */
  retrievedAt: string;
  /** Reference period covered by the data we kept. */
  referencePeriod?: string;
  licence: string;
  attribution?: string;
  /** Plain-language description of what we did to it. */
  transformations?: string[];
  notes?: string[];
  status?: 'ok' | 'stale_snapshot' | 'partial' | 'failed';
}

// ---------------------------------------------------------------- Insights

export type InsightTopic =
  | 'housing' | 'work' | 'budget' | 'immigrant_income' | 'settlement' | 'language_life' | 'climate';

export interface Finding {
  id: string;
  headline: string;
  detail: string;
  /** Observation = read straight from a source; calculation = derived (see calc). */
  kind: 'observation' | 'calculation';
  stat?: { value: number; unit: Unit; label: string; period: string };
  /** Places this finding is about — powers "show on map". */
  placeIds: string[];
  /** Map layer to switch to when jumping to the map (a metric id, or a virtual layer: 'noc_wage', 'rent_share'). */
  metricId?: string;
  /** Extra explorer URL parameters for the jump, e.g. { noc: '31301', unit: '1 bedroom' }. */
  mapParams?: Record<string, string>;
  sourceIds: string[];
  /** Reproducible description of the calculation. */
  calc?: string;
}

export type ChartType =
  | 'line'           // x = period, one line per series
  | 'bar_ranked'     // horizontal bars, one series, points sorted
  | 'dot_compare'    // dots per category for 2+ series (e.g. asking vs paid)
  | 'range'          // low–median–high (y0, y, y1)
  | 'scatter'        // x numeric, y numeric, label/placeId per point
  | 'stacked_bar'    // shares per category
  | 'monthly_climate'
  | 'slope';         // two periods per category

export interface ChartPoint {
  x: string | number;
  y: number | null;
  y0?: number | null;
  y1?: number | null;
  label?: string;
  placeId?: string;
  f?: Flag[];
}

export interface ChartSeries {
  id: string;
  label: string;
  placeId?: string;
  points: ChartPoint[];
}

export interface ChartSpec {
  id: string;
  type: ChartType;
  title: string;
  subtitle?: string;
  unit: Unit;
  /** Optional second unit (scatter x-axis). */
  xUnit?: Unit;
  xLabel?: string;
  yLabel?: string;
  series: ChartSeries[];
  /** Optional reference line(s), e.g. national average. */
  refs?: { label: string; value: number; axis?: 'x' | 'y' }[];
  notes?: string;
  sourceIds: string[];
}

export interface Insight {
  id: string;
  topic: InsightTopic;
  /** Headline derived from the data. */
  title: string;
  /** The newcomer question it answers. */
  question: string;
  dek: string;
  findings: Finding[];
  charts: ChartSpec[];
  /** Practical interpretation paragraphs. */
  interpretation: string[];
  methodology: string[];
  limitations: string[];
  sourceIds: string[];
  relatedPlaceIds: string[];
  /** ISO date of the build that computed it. */
  computedAt: string;
}

// ---------------------------------------------------------------- App bundle manifest

export interface DataManifest {
  product: string;
  builtAt: string;
  files: Record<string, { bytes: number; records: number }>;
  coverage: { placeId: string; metrics: number; core: boolean }[];
}
