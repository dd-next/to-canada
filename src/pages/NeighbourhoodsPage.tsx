import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useCore } from '../data/core';
import { useJSON } from '../data/useJSON';
import { PRODUCT } from '../config';
import type { Neighbourhood, NeighbourhoodBundle, NeighbourhoodDefinition } from '../types/neighbourhoods';
import { NeighbourhoodMap } from '../components/neighbourhoods/NeighbourhoodMap';
import { hasProfile, mapLayers } from '../components/neighbourhoods/coverage';
import { ButtonAnchor, ButtonLink } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { ProfileSection } from '../components/place/ProfileSection';
import '../styles/place.css';
import '../styles/neighbourhoods.css';

const pathFor = (city: string, id?: string) => `/place/${city}/neighbourhoods${id ? `/${id}` : ''}`;
const normalise = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function format(value: number | null | undefined, definition: NeighbourhoodDefinition) {
  if (value == null) return 'Not available';
  const n = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 1 }).format(value);
  return definition.unit === 'percent' ? `${n}%` : definition.unit === 'CAD_month' ? `$${n}/mo` : n;
}

export default function NeighbourhoodsPage() {
  const { placeId = '', neighbourhoodId } = useParams();
  const { manifest, placeById } = useCore();
  const file = `neighbourhoods/${placeId}.json`;
  const available = !!manifest.files[file];
  const { data, loading, error } = useJSON<NeighbourhoodBundle>(available ? file : null);
  // useJSON retains previous data while a new city is loading. Never show it under another city.
  const bundle = data?.placeId === placeId ? data : undefined;
  const neighbourhood = bundle?.neighbourhoods.find(n => n.id === neighbourhoodId);
  const name = neighbourhood?.name ?? placeById.get(placeId)?.name ?? 'Neighbourhoods';
  useEffect(() => {
    const prev = document.title;
    document.title = `${name} neighbourhoods — ${PRODUCT.name}`;
    return () => { document.title = prev; };
  }, [name]);
  return <div className="page hood-page">
    <nav className="hood-breadcrumbs" aria-label="Breadcrumb">
      <Link to="/">Explore</Link><span>/</span><Link to={`/place/${placeId}`}>{placeById.get(placeId)?.name ?? placeId}</Link>
      <span>/</span><Link to={pathFor(placeId)}>Neighbourhoods</Link>{neighbourhood && <><span>/</span><span>{neighbourhood.name}</span></>}
    </nav>
    {!available ? <div className="hood-status"><h1 className="h1">Neighbourhoods are not covered here yet.</h1><p>Explore the cities with available neighbourhood data.</p><CityLinks /></div>
      : error ? <div className="hood-status" role="alert"><h1 className="h1">The neighbourhood snapshot could not be loaded.</h1><p>Please reload to try again.</p></div>
        : loading || !bundle ? <p className="hood-status" role="status">Loading neighbourhoods…</p>
          : neighbourhoodId && !neighbourhood ? <div className="hood-status"><h1 className="h1">Neighbourhood not found.</h1><ButtonLink to={pathFor(placeId)}>Browse {bundle.cityName}</ButtonLink></div>
            : neighbourhood && !hasProfile(neighbourhood) ? <div className="hood-status"><h1 className="h1">{neighbourhood.name}</h1><p>This area is mapped, but substantive profile data is not available in this snapshot.</p><ButtonLink to={pathFor(placeId)}>Browse {bundle.cityName}</ButtonLink></div>
              : neighbourhood ? <Detail key={`${placeId}/${neighbourhoodId}`} bundle={bundle} n={neighbourhood} /> : <Directory key={placeId} bundle={bundle} />}
  </div>;
}

function CityLinks() {
  const { manifest, placeById } = useCore();
  const cities = Object.keys(manifest.files).flatMap(file => file.match(/^neighbourhoods\/([a-z0-9-]+)\.json$/)?.[1] ?? [])
    .sort((a, b) => (placeById.get(a)?.name ?? a).localeCompare(placeById.get(b)?.name ?? b));
  return <nav className="cluster hood-city-links" aria-label="Cities with neighbourhood profiles">{cities.map(city => <Link key={city} to={pathFor(city)}>{placeById.get(city)?.name ?? city}</Link>)}</nav>;
}

function Directory({ bundle }: { bundle: NeighbourhoodBundle }) {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const layerOptions = mapLayers(bundle);
  const requested = params.get('layer') ?? '';
  const layer = layerOptions.includes(requested) ? requested : layerOptions[0] ?? Object.keys(bundle.definitions)[0];
  const [selected, setSelected] = useState<string>();
  const rows = useMemo(() => bundle.neighbourhoods.filter(n => normalise(n.name).includes(normalise(query.trim()))), [bundle, query]);
  const visibleIds = useMemo(() => new Set(rows.map(n => n.id)), [rows]);
  const set = (key: string, value: string) => setParams(prev => { const next = new URLSearchParams(prev); if (value) next.set(key, value); else next.delete(key); return next; }, { replace: true });
  return <>
    <header className="hood-hero">
      <div><p className="kicker">A closer look / {bundle.cityName}</p><h1>Find your corner<br />of {bundle.cityName}.</h1><p className="dek">Go beyond the city average. Explore the homes, households and public spaces that make each neighbourhood different.</p></div>
      <div className="hood-hero__aside"><strong>{bundle.neighbourhoods.length}</strong><span>mapped areas</span><CityLinks /></div>
    </header>
    <p className="hood-coverage">{bundle.boundaryNote}{bundle.coverageNote && <> {bundle.coverageNote}</>}</p>
    <div className="hood-explorer">
      <div className="hood-explorer__map">
        <label className="hood-field">Map layer<select value={layer} onChange={e => set('layer', e.target.value)}>{layerOptions.map(key => <option key={key} value={key}>{bundle.definitions[key].label}</option>)}</select></label>
        <NeighbourhoodMap bundle={bundle} layer={layer} selected={selected} visibleIds={visibleIds} />
        <p className="hood-note">{bundle.definitions[layer].period} · {bundle.definitions[layer].note}</p>
      </div>
      <div className="hood-directory">
        <label className="hood-field">Find a neighbourhood<input type="search" value={query} onChange={e => set('q', e.target.value)} placeholder={`Search ${bundle.cityName} neighbourhoods`} /></label>
        <p className="hood-result-count" role="status">{rows.length} of {bundle.neighbourhoods.length} areas · A–Z</p>
        <ul className="hood-results">
          {rows.map(n => <li key={n.id}>{hasProfile(n) ? <Link to={pathFor(bundle.placeId, n.id)} onMouseEnter={() => setSelected(n.id)} onFocus={() => setSelected(n.id)}>
            <span><strong>{n.name}</strong><small>{n.metrics.population?.value == null ? 'Population unavailable' : `${bundle.definitions.population.label}: ${format(n.metrics.population.value, bundle.definitions.population)} · ${bundle.definitions.population.period}`}{n.description && ' · Local guide'}</small></span>
            <span className="hood-results__value">{format(n.metrics[layer]?.value, bundle.definitions[layer])}<span aria-hidden="true"> ↗</span></span>
          </Link> : <div className="hood-results__unavailable" tabIndex={0} onFocus={() => setSelected(n.id)}><strong>{n.name}</strong><small>Mapped boundary only. Profile data unavailable.</small></div>}</li>)}
        </ul>
        {!rows.length && <div className="hood-status"><p>No neighbourhood matches “{query}”.</p><button className="text-link" onClick={() => set('q', '')}>Clear search</button></div>}
      </div>
    </div>
    <Perspectives bundle={bundle} />
    <Sources bundle={bundle} />
  </>;
}

function Metric({ bundle, n, metric }: { bundle: NeighbourhoodBundle; n: Neighbourhood; metric: string }) {
  const def = bundle.definitions[metric];
  if (!def) return null;
  const value = n.metrics[metric];
  return <div className="hood-metric"><h3>{def.label}</h3><strong>{format(value?.value, def)}</strong><span>{def.period}</span><p>{value?.value == null ? value?.missingReason : def.note}</p><a href={`#source-${def.sourceId}`}>Source & definition</a></div>;
}

function Detail({ bundle, n }: { bundle: NeighbourhoodBundle; n: Neighbourhood }) {
  const housingMetrics = ['apartments', 'renters', 'tenantShelter', 'transit', 'walkCycle'];
  const hasHousing = housingMetrics.some(key => bundle.definitions[key]);
  const outsideMetrics = ['parkland', 'parks', 'rail', 'busStops', 'libraries', 'communityCentres'];
  const overviewLayer = mapLayers(bundle)[0] ?? Object.keys(bundle.definitions)[0];
  return <>
    <header className="hood-hero hood-hero--detail"><div><p className="kicker">Neighbourhood / {bundle.cityName}</p><h1>{n.name}</h1><p className="dek">A closer look at life here, from the households to the public spaces around them.</p></div><ButtonLink to={pathFor(bundle.placeId)} variant="outline">All neighbourhoods</ButtonLink></header>
    <p className="hood-coverage">{bundle.boundaryNote}{bundle.coverageNote && <> {bundle.coverageNote}</>}</p>
    <div className="hood-overview">
      <NeighbourhoodMap bundle={bundle} layer={overviewLayer} focus={n.id} />
      <div className="hood-facts">{['population', 'households', 'householdSize', 'children', 'livingAlone'].map(metric => <Metric key={metric} bundle={bundle} n={n} metric={metric} />)}</div>
    </div>
    {n.description && <section className="hood-description" aria-labelledby="hood-description-title"><p className="kicker">Local guide</p><h2 id="hood-description-title">Living in {n.name}</h2><p className="hood-note">Sources verified {n.description.verifiedAt.slice(0, 10)}. Editorial observations interpret the cited evidence; they are not a survey of residents.</p><div className="hood-description__sections">{n.description.sections.map((section, i) => <article key={i}><span className="hood-description__kind">{section.kind === 'measured' ? 'Source facts' : 'Editorial interpretation'}</span><h3>{section.heading}</h3><p>{section.text}</p><div className="hood-description__citations">{section.sourceIds.map(id => <a key={id} href={`#source-${id}`}>{bundle.sources.find(source => source.id === id)?.title ?? id}</a>)}</div></article>)}</div></section>}
    {n.quality && ['incomplete_enumeration_flag', 'short_form_data_quality_flag', 'long_form_data_quality_flag', 'long_form_income_data_quality'].some(key => n.quality?.[key] != null && Number(n.quality[key]) !== 0) && <p className="hood-coverage">The publisher flags census data quality for this area. Check the original census tables before relying on small differences.</p>}
    <ProfileSection id="homes" num="01" title="Homes & getting around" dek={hasHousing ? 'A historical picture of the housing mix and journeys to work.' : 'More detail in the city’s community profile.'}>
      {hasHousing ? <div className="hood-metrics">{housingMetrics.map(metric => <Metric key={metric} bundle={bundle} n={n} metric={metric} />)}</div>
        : <p className="hood-note">Housing and commuting statistics have not been collected at this geography in this release. Check the official community profiles below.</p>}
      <div className="hood-actions"><ButtonAnchor href={bundle.links.profiles} variant="outline">City neighbourhood profiles</ButtonAnchor><ButtonLink to={`/place/${bundle.placeId}#housing`}>Metropolitan housing context</ButtonLink></div>
      <p className="hood-note">Current asking rents are not available at neighbourhood level here. Metropolitan rent figures describe a wider area.</p>
    </ProfileSection>
    <ProfileSection id="outside" num="02" title="Outside your front door" dek="Public spaces, transport and amenities from the available local data.">
      <div className="hood-metrics">{outsideMetrics.map(metric => <Metric key={metric} bundle={bundle} n={n} metric={metric} />)}</div>
      <div className="hood-place-lists">
        <div><h3>Park sites in this area</h3>{n.parks.length ? <ul>{n.parks.slice(0, 10).map((park, i) => <li key={`${park}-${i}`}>{park}</li>)}</ul> : <p>{n.metrics.parks?.value == null ? 'Park coverage is not available in this snapshot.' : 'No park sites matched by this source’s method.'}</p>}{n.parks.length > 10 && <details><summary>{n.parks.length - 10} more park sites</summary><ul>{n.parks.slice(10).map((park, i) => <li key={`${park}-${i}`}>{park}</li>)}</ul></details>}</div>
        <div><h3>{bundle.transportLabel ?? 'Rail stations in or near the area'}</h3>{n.stations.length ? <ul>{n.stations.map(s => <li key={s.id}>{s.name}<small>{s.distanceToBoundaryM === 0 ? 'Inside the boundary' : `${s.distanceToBoundaryM} m from the boundary`}</small></li>)}</ul> : <p>{n.metrics.rail?.value == null ? 'Rail station coverage is not available in this snapshot.' : 'No listed rail stations inside or within 800 m of the boundary.'}</p>}<p className="hood-note">Check service and the route from your exact address. Proximity to an area’s boundary is not a walking distance from your home.</p></div>
        {!!n.amenities?.length && <div><h3>Local amenities</h3><ul>{n.amenities.map((amenity, i) => <li key={`${amenity.sourceId}-${i}`}>{amenity.name}<small>{amenity.category} · <a href={`#source-${amenity.sourceId}`}>Source</a></small></li>)}</ul></div>}
      </div>
    </ProfileSection>
    <Perspectives bundle={bundle} n={n} />
    <Sources bundle={bundle} />
  </>;
}

function Perspectives({ bundle, n }: { bundle: NeighbourhoodBundle; n?: Neighbourhood }) {
  const reddit = new URL('search/', bundle.links.reddit);
  reddit.searchParams.set('q', n ? `"${n.name}"` : 'neighbourhood moving');
  reddit.searchParams.set('restrict_sr', 'on');
  return <section className="hood-perspectives" aria-labelledby="hood-perspectives-title">
    <div><p className="kicker">Local perspectives</p><h2 id="hood-perspectives-title">What’s it like to live here?</h2><p>Noise, atmosphere and everyday experiences are best checked with people who know the streets. Explore these external sources alongside the facts.</p></div>
    <div className="hood-perspectives__links">
      <a href={bundle.links.hoodmaps} target="_blank" rel="noreferrer noopener"><strong>Hoodmaps <Icon name="external" size={15} /></strong><span>A crowdsourced map of {bundle.cityName}. Informal opinions and humour; labels may be inaccurate or offensive.</span></a>
      <a href={reddit.toString()} target="_blank" rel="noreferrer noopener"><strong>{n ? `${n.name} on Reddit` : `r/${bundle.cityName}`} <Icon name="external" size={15} /></strong><span>Search residents’ discussions. Individual experiences, not a representative survey.</span></a>
      <a href={bundle.links.profiles} target="_blank" rel="noreferrer noopener"><strong>Official community profiles <Icon name="external" size={15} /></strong><span>Read the city’s fuller picture of the community and its residents.</span></a>
    </div>
    <p className="hood-note">Local experiences can differ from block to block. Visit the area at different times and check transport from the address you are considering.</p>
  </section>;
}

function Sources({ bundle }: { bundle: NeighbourhoodBundle }) {
  return <section className="hood-sources" aria-labelledby="hood-sources-title"><h2 id="hood-sources-title">Sources & coverage</h2><p>{bundle.boundaryNote} School access, current asking rents, measured noise and neighbourhood crime rates are not included in this release.</p>
    {bundle.sources.map(source => <details key={source.id} id={`source-${source.id}`}><summary>{source.title}</summary><div><p>{source.publisher} · Reference: {source.referencePeriod}</p><p>Publisher update: {source.releaseDate ?? 'Not stated'} · Retrieved: {source.retrievedAt.slice(0, 10)}. Snapshot; not a live feed.</p>{Object.values(bundle.definitions).filter(d => d.sourceId === source.id).map(d => <p key={d.label}><strong>{d.label} ({d.period}):</strong> {d.note}{d.geographicScope && <> Geography: {d.geographicScope}</>}</p>)}{source.notes?.map((note, i) => <p key={i}>{note}</p>)}<p>{source.attribution}</p><p>{source.licence}</p><a href={source.url} target="_blank" rel="noreferrer noopener">Open source dataset ↗</a></div></details>)}
  </section>;
}
