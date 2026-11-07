import { useMemo, useRef } from 'react';
import { useJSON } from '../data/useJSON';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Icon } from '../components/ui/Icon';
import { SectionHeader } from '../components/ui/SectionHeader';
import { Select, type SelectOption } from '../components/ui/Select';
import LmiaRecord from '../components/lmia/LmiaRecord';
import LmiaSources from '../components/lmia/LmiaSources';
import { filterLmiaRows, LMIA_PAGE_SIZE, LMIA_QUERY_KEYS, pageNumber, periodSelection, readLmiaFilters, summarizeLmiaRows, UNREPORTED } from '../components/lmia/model';
import { useLmiaRows } from '../components/lmia/useLmiaRows';
import { formatNumber } from '../lib/format';
import { useUrlState, type ParamPatch } from '../lib/state';
import type { LmiaMetadata } from '../types/lmia';
import '../styles/lmia.css';

const OFFICIAL_DATASET = 'https://open.canada.ca/data/en/dataset/90fed587-1364-4f33-a9ee-208181dc0b97';

function preserveSelection(options: SelectOption[], selected: string): SelectOption[] {
  return selected && !options.some((option) => option.value === selected) ? [...options, { value: selected, label: `${selected} (not in this snapshot)` }] : options;
}

function CountSummary({ label, value, overlap, records }: { label: string; value: { known: number; unknown: number }; overlap: boolean; records: number }) {
  const entirelyUnknown = records > 0 && value.unknown === records;
  return <div><dt>{label}</dt><dd className="num">{overlap ? 'Not summed' : entirelyUnknown ? 'Unknown' : formatNumber(value.known)}</dd><p>{overlap ? 'Reporting periods overlap' : value.unknown > 0 ? `${formatNumber(value.unknown)} record${value.unknown === 1 ? '' : 's'} with unknown counts${entirelyUnknown ? '' : '; known counts shown'}` : 'Across all matching records'}</p></div>;
}

export default function LmiaPage() {
  const metadata = useJSON<LmiaMetadata>('lmia/metadata.json');
  const [params, update] = useUrlState();
  const filters = readLmiaFilters(params);
  const filterKey = JSON.stringify(filters);
  const requestedPeriod = params.get('period');
  const history = !!filters.employerLocationId;
  const periods = useMemo(() => periodSelection(metadata.data?.periods ?? [], requestedPeriod, history), [metadata.data, requestedPeriod, history]);
  const rows = useLmiaRows(periods, metadata.data?.generatedAt ?? '');
  const filtered = useMemo(() => filterLmiaRows(rows.rows ?? [], filters), [rows.rows, filterKey]);
  const summary = useMemo(() => summarizeLmiaRows(filtered, periods), [filtered, periods]);
  const periodById = useMemo(() => new Map((metadata.data?.periods ?? []).map((period) => [period.id, period])), [metadata.data]);
  const resourceById = useMemo(() => new Map((metadata.data?.resources ?? []).map((resource) => [resource.id, resource])), [metadata.data]);
  const page = pageNumber(params.get('page'), filtered.length);
  const pages = Math.max(1, Math.ceil(filtered.length / LMIA_PAGE_SIZE));
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const selectedPeriod = requestedPeriod ?? (history ? 'all' : periods[0]?.id ?? '');
  const filtering = Object.values(filters).some(Boolean) || !!requestedPeriod;
  const setFilter = (patch: ParamPatch, replace = false) => update({ ...patch, page: null }, { replace });
  const clear = () => update(Object.fromEntries(LMIA_QUERY_KEYS.map((key) => [key, null])));
  const goToPage = (next: number) => {
    update({ page: next === 1 ? null : next });
    resultHeading.current?.focus({ preventScroll: true });
    resultHeading.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  };
  const complete = !!metadata.data && !metadata.loading && !rows.loading && !!rows.rows && !rows.error && periods.length > 0;
  const visibleRows = filtered.slice((page - 1) * LMIA_PAGE_SIZE, page * LMIA_PAGE_SIZE);
  const historyExample = history ? rows.rows?.find((row) => row.employerLocationId === filters.employerLocationId) : undefined;

  return (
    <div className="page lmia">
      <SectionHeader level={1} kicker="Historical employer records" title="LMIA History" dek="Explore employers and locations named in historical positive Labour Market Impact Assessment decisions, directly from Canada’s official releases." />
      <aside className="lmia__disclaimer" aria-label="How to use these records"><Icon name="info" size={18} /><p><strong>A historical decision is not a current job offer.</strong> These records do not establish current vacancies, an employer’s promise to sponsor, or an individual applicant’s eligibility. Confirm current opportunities and requirements independently.</p></aside>
      {metadata.loading && <p className="app-status" role="status">Loading historical LMIA coverage…</p>}
      {metadata.error && <EmptyState title="LMIA history could not be loaded"><p>Please reload or try again later. The <a className="link" href={OFFICIAL_DATASET} target="_blank" rel="noopener noreferrer">official ESDC dataset</a> remains the source for these historical records.</p></EmptyState>}
      {metadata.data && <>
        <LmiaSources metadata={metadata.data} />
        {metadata.data.periods.length > 0 && <section className="lmia__filters" aria-label="Filter historical LMIA records">
          <div className="field lmia__search"><label className="field__label label" htmlFor="lmia-employer">Employer search</label><div className="lmia__searchbox"><Icon name="search" size={16} /><input id="lmia-employer" type="search" value={filters.query} placeholder="Publisher employer name…" onChange={(event) => setFilter({ q: event.target.value || null }, true)} /></div></div>
          <Select label="Reporting period" value={selectedPeriod} onChange={(value) => setFilter({ period: value || null })} options={preserveSelection([{ value: 'all', label: 'All available periods' }, ...[...metadata.data.periods].sort((a, b) => b.end.localeCompare(a.end)).map((period) => ({ value: period.id, label: `${period.label} · ${formatNumber(period.rowCount)} records` }))], selectedPeriod)} hint="Latest period opens first. All periods loads the complete historical snapshot." />
          <Select label="Province / territory" value={filters.province} onChange={(value) => setFilter({ province: value || null })} options={preserveSelection([{ value: '', label: 'All publisher geographies' }, ...metadata.data.facets.provinces.map((province) => ({ value: province.code, label: province.label })), { value: UNREPORTED, label: 'Not reported' }], filters.province)} />
          <div className="field"><label className="field__label label" htmlFor="lmia-location">Location / address</label><input id="lmia-location" className="lmia__input" type="search" value={filters.location} placeholder="City, postal code or address…" onChange={(event) => setFilter({ location: event.target.value || null }, true)} /></div>
          <div className="field"><label className="field__label label" htmlFor="lmia-occupation">Occupation / NOC code</label><input id="lmia-occupation" className="lmia__input" type="search" value={filters.occupation} placeholder="Occupation title or code…" onChange={(event) => setFilter({ occupation: event.target.value || null }, true)} /></div>
          <Select label="NOC version" value={filters.nocVersion} onChange={(value) => setFilter({ nocVersion: value || null })} options={preserveSelection([{ value: '', label: 'All published versions' }, ...metadata.data.facets.nocVersions.map((value) => ({ value, label: value })), { value: UNREPORTED, label: 'Not reported' }], filters.nocVersion)} hint="The same code can mean different occupations in different versions." />
          <Select label="Program stream" value={filters.stream} onChange={(value) => setFilter({ stream: value || null })} options={preserveSelection([{ value: '', label: 'All streams' }, ...metadata.data.facets.streams.map((value) => ({ value, label: value })), { value: UNREPORTED, label: 'Not reported' }], filters.stream)} />
        </section>}
        {history && <aside className="lmia__history" aria-label="Employer and location history"><div><h2 className="h3">{historyExample?.employer ?? 'Employer and location history'}</h2>{historyExample?.address && <p>{historyExample.address}</p>}<p>Matches the publisher’s exact name, address and province. Spelling changes and other locations remain separate; this is not a legal entity match.</p></div><Button variant="ghost" size="sm" onClick={() => setFilter({ employerLocation: null })}>Leave history view</Button></aside>}
        {filters.recordId && <p className="lmia__linked-record">Showing a linked record. <Button variant="ghost" size="sm" onClick={() => setFilter({ record: null })}>Show other records</Button></p>}
        {rows.loading && <p className="lmia__loading" role="status">Loading {formatNumber(rows.total)} reporting period{rows.total === 1 ? '' : 's'}… {formatNumber(rows.loaded)} of {formatNumber(rows.total)} ready. Results and totals will appear when all selected periods have loaded.</p>}
        {rows.error && <EmptyState title="The selected history could not be fully loaded"><p>No partial totals are shown. Try reloading this page or choose another reporting period. You can also consult the <a className="link" href={OFFICIAL_DATASET} target="_blank" rel="noopener noreferrer">official releases</a>.</p></EmptyState>}
        {!rows.loading && !rows.error && periods.length === 0 && <EmptyState title={metadata.data.periods.length === 0 ? 'No validated historical records are available yet' : 'That reporting period is not in this snapshot'} action={metadata.data.periods.length > 0 ? <Button onClick={() => setFilter({ period: null })}>Show latest available period</Button> : undefined}><p>{metadata.data.periods.length === 0 ? 'The official releases could not be retrieved or validated. Check the source status above, or follow the official dataset link to browse the publisher’s files.' : 'Choose an available reporting period from the list above.'}</p></EmptyState>}
        {complete && <>
          <div className="lmia__results-heading"><h2 ref={resultHeading} tabIndex={-1} className="label" aria-live="polite">{formatNumber(filtered.length)} matching record{filtered.length === 1 ? '' : 's'} · {formatNumber(periods.length)} period{periods.length === 1 ? '' : 's'} searched</h2>{filtering && <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button>}</div>
          <dl className="lmia__totals"><div><dt>Publisher names and locations</dt><dd className="num">{formatNumber(summary.locations)}</dd><p>Exact name, address and province combinations</p></div><CountSummary label="Approved LMIAs" value={summary.lmias} overlap={summary.overlappingPeriods} records={summary.rows} /><CountSummary label="Approved positions" value={summary.positions} overlap={summary.overlappingPeriods} records={summary.rows} /></dl>
          {summary.nocVersions.length > 1 && <p className="lmia__version-note">These results include separate NOC classifications: {summary.nocVersions.join(', ')}. Occupation codes retain their original version; use the NOC version filter when comparing an occupation.</p>}
          {summary.overlappingPeriods && <p className="lmia__warning">Selected source periods overlap. Approval counts are displayed per record and are not summed across those periods.</p>}
          {filtered.length === 0 && <EmptyState title="No records match these filters" action={<Button onClick={clear}>Clear filters</Button>}><p>Try a shorter employer name, another reporting period, or fewer filters. A missing match does not establish whether an employer has ever received an LMIA.</p></EmptyState>}
          <div className="lmia__records">{visibleRows.map((row) => <LmiaRecord key={row.id} row={row} period={periodById.get(row.periodId)} resource={resourceById.get(row.resourceId)} inHistory={history} />)}</div>
          {filtered.length > 0 && <nav className="lmia__pagination" aria-label="LMIA results pages"><Button disabled={page === 1} onClick={() => goToPage(page - 1)} icon="chevronLeft">Previous</Button><p>Page {formatNumber(page)} of {formatNumber(pages)}<span>Records {formatNumber((page - 1) * LMIA_PAGE_SIZE + 1)}–{formatNumber(Math.min(page * LMIA_PAGE_SIZE, filtered.length))} of {formatNumber(filtered.length)}</span></p><Button disabled={page === pages} onClick={() => goToPage(page + 1)} iconRight="chevronRight">Next</Button></nav>}
          <p className="lmia__method-note">Counts describe positive LMIA decisions and approved positions in the selected historical releases. One publisher record is not necessarily one decision, one business, one location currently operating, or one job still available.</p>
        </>}
      </>}
    </div>
  );
}
