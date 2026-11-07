import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useJSON } from '../data/useJSON';
import { useUrlState } from '../lib/state';
import { formatNumber } from '../lib/format';
import { SectionHeader } from '../components/ui/SectionHeader';
import { Select } from '../components/ui/Select';
import { Button, ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import ServiceCard from '../components/services/ServiceCard';
import ServicesFreshness from '../components/services/ServicesFreshness';
import { boundedPage, COVERAGE_LABELS, filterServices, readServiceFilters, SERVICE_FILTER_KEYS, SERVICES_PAGE_SIZE } from '../components/services/filter';
import type { ServicesCatalogue } from '../types/services';
import '../styles/services.css';

export default function ServicesPage() {
  const feed = useJSON<ServicesCatalogue>('services/catalogue.json');
  const [params, update] = useUrlState();
  const filters = readServiceFilters(params);
  const serviceId = params.get('service') ?? '';
  const facets = useMemo(() => {
    const entries = feed.data?.entries ?? [];
    return {
      categories: [...new Set(entries.map((entry) => entry.category))].sort(),
      jurisdictions: [...new Set(entries.map((entry) => entry.jurisdiction))].sort(),
      coverage: [...new Set(entries.map((entry) => entry.coverage.kind))].sort(),
    };
  }, [feed.data]);
  const searchKey = params.toString();
  const filtered = useMemo(() => filterServices(feed.data?.entries ?? [], readServiceFilters(new URLSearchParams(searchKey))), [feed.data, searchKey]);
  const selected = serviceId ? feed.data?.entries.find((entry) => entry.id === serviceId) : undefined;
  const page = boundedPage(params.get('svcPage'), filtered.length);
  const pageCount = Math.max(1, Math.ceil(filtered.length / SERVICES_PAGE_SIZE));
  const resultsTitle = useRef<HTMLHeadingElement>(null);
  const filtering = !!(filters.query || filters.category || filters.jurisdiction || filters.coverage || filters.state !== 'current');
  const clear = () => update(Object.fromEntries(SERVICE_FILTER_KEYS.map((key) => [key, null])));
  const change = (key: string, value: string, replace = false) => update({ [key]: value || null, svcPage: null, service: null }, { replace });
  const turnPage = (next: number) => {
    update({ svcPage: next === 1 ? null : next });
    resultsTitle.current?.focus();
    resultsTitle.current?.scrollIntoView({ block: 'start' });
  };
  const options = (values: string[], all: string, selectedValue: string) => [{ value: '', label: all }, ...values.map((value) => ({ value, label: value })), ...(selectedValue && !values.includes(selectedValue) ? [{ value: selectedValue, label: `${selectedValue} (not in this snapshot)` }] : [])];

  return <div className="page services">
    <SectionHeader level={1} kicker="Across Canada" title="Services directory" dek="Find public services, community resources and practical help. Browse every category and location in the Awesome Canada catalogue." />
    {feed.data && <ServicesFreshness meta={feed.data.meta} />}
    {feed.loading && <p className="app-status" role="status">Loading the Services catalogue…</p>}
    {feed.error && <EmptyState title="The Services catalogue could not be loaded"><p>Please reload or try again later. You can also browse <a className="link" href="https://awesome-canada.ca/" target="_blank" rel="noopener noreferrer">Awesome Canada</a>.</p></EmptyState>}
    {feed.data && serviceId && <section className="services__detail" aria-label="Selected service">
      <ButtonLink to="/services" variant="ghost" size="sm">← Back to directory</ButtonLink>
      {selected ? <ServiceCard entry={selected} detail /> : <EmptyState title="This service is not in our catalogue"><p>The link may be incomplete or refer to a different snapshot. <Link className="link" to="/services">Browse the full directory</Link>.</p></EmptyState>}
    </section>}
    {!serviceId && <>
      <section className="services__filters" aria-label="Filter services">
        <div className="field services__search"><label htmlFor="services-search" className="field__label label">Search services</label><input id="services-search" type="search" value={filters.query} placeholder="Name, description, place or tag…" onChange={(event) => change('svcQ', event.target.value, true)} /></div>
        <Select label="Original category" value={filters.category} onChange={(value) => change('svcCategory', value)} options={options(facets.categories, 'All categories', filters.category)} />
        <Select label="Jurisdiction" value={filters.jurisdiction} onChange={(value) => change('svcJurisdiction', value)} options={options(facets.jurisdictions, 'All jurisdictions', filters.jurisdiction)} />
        <Select label="Coverage" value={filters.coverage} onChange={(value) => change('svcCoverage', value)} options={[{ value: '', label: 'All coverage types' }, ...facets.coverage.map((value) => ({ value, label: COVERAGE_LABELS[value] ?? value })), ...(filters.coverage && !facets.coverage.some((value) => value === filters.coverage) ? [{ value: filters.coverage, label: `${filters.coverage} (not in this snapshot)` }] : [])]} />
        <Select label="Catalogue status" value={filters.state} onChange={(value) => change('svcState', value === 'current' ? '' : value)} options={[{ value: 'current', label: 'Currently listed' }, { value: 'retired', label: 'Retired records' }, { value: 'all', label: 'All records, including retired' }]} />
      </section>
      <p className="services__fine">Jurisdiction and coverage are the source’s labels, not a promise that a service is available to everyone in that area. Check the destination for current requirements.</p>
      {feed.data && <>
        <div className="services__results-head"><h2 className="services__count" tabIndex={-1} ref={resultsTitle} aria-live="polite">{formatNumber(filtered.length)} {filtered.length === 1 ? 'service' : 'services'}{filtering ? ' match your filters' : ' currently listed'}</h2>{filtering && <Button size="sm" variant="ghost" onClick={clear}>Clear filters</Button>}</div>
        {filtered.length === 0 && <EmptyState title="No services match" action={filtering ? <Button onClick={clear}>Clear filters</Button> : undefined}><p>Try a broader search or another category, jurisdiction or coverage type.</p></EmptyState>}
        <div className="services__grid">{filtered.slice((page - 1) * SERVICES_PAGE_SIZE, page * SERVICES_PAGE_SIZE).map((entry) => <ServiceCard key={entry.id} entry={entry} />)}</div>
        {pageCount > 1 && <nav className="services__pagination" aria-label="Services result pages"><Button disabled={page <= 1} onClick={() => turnPage(page - 1)}>Previous</Button><p>Page {formatNumber(page)} of {formatNumber(pageCount)}<span>Showing {formatNumber((page - 1) * SERVICES_PAGE_SIZE + 1)}–{formatNumber(Math.min(page * SERVICES_PAGE_SIZE, filtered.length))} of {formatNumber(filtered.length)}</span></p><Button disabled={page >= pageCount} onClick={() => turnPage(page + 1)}>Next</Button></nav>}
      </>}
    </>}
  </div>;
}
