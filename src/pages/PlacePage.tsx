import { useCallback, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Occupation, Place, ProgramRecord, Series, WageTable } from '../types/contract';
import type { JobSearchConfig } from '../adapters/jobs';
import { useCore } from '../data/core';
import { useJSON } from '../data/useJSON';
import { PRODUCT } from '../config';
import { describeMatch, searchPlaces } from '../lib/places';
import { useSearchParamState } from '../lib/state';
import { INDEX_PATH, useInsightFiles, type InsightSummary } from '../components/insights/model';
import { useScrollReset } from '../components/insights/scroll';
import { ClimateSection, hasClimateData } from '../components/place/ClimateSection';
import { CostSection } from '../components/place/CostSection';
import { HousingSection } from '../components/place/HousingSection';
import { NeighbourhoodSection } from '../components/place/NeighbourhoodSection';
import { ImmigrationSection, hasImmigrationData, programsFor } from '../components/place/ImmigrationSection';
import { KeyFacts } from '../components/place/KeyFacts';
import { PeopleSection, hasPeopleData } from '../components/place/PeopleSection';
import { PlaceFindings } from '../components/place/PlaceFindings';
import { PlaceHero } from '../components/place/PlaceHero';
import { PlaceSources } from '../components/place/PlaceSources';
import { ProfileSection, SectionNav, type NavItem } from '../components/place/ProfileSection';
import { Tradeoffs } from '../components/place/Tradeoffs';
import { WorkSection } from '../components/place/WorkSection';
import { ButtonLink } from '../components/ui/Button';
import { Kicker } from '../components/ui/SectionHeader';
import '../styles/place.css';

export default function PlacePage() {
  const { placeId = '' } = useParams();
  const core = useCore();
  const place = core.placeById.get(placeId);
  return place ? <Profile key={place.id} place={place} /> : <PlaceNotFound id={placeId} />;
}

function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

function PlaceNotFound({ id }: { id: string }) {
  const core = useCore();
  const matches = useMemo(() => searchPlaces(core.places, id.replace(/[-_+]+/g, ' '), 5), [core.places, id]);
  usePageTitle(`Place not found — ${PRODUCT.name}`);
  return (
    <div className="page">
      <div className="pmissing">
        <Kicker>Place profiles</Kicker>
        <h1 className="h1">No profile for “{id}”.</h1>
        <p className="dek">
          {PRODUCT.name} covers {core.places.length} metropolitan areas and larger towns. Municipalities inside a metropolitan area (Mississauga, Laval, Surrey…) are
          covered by that area’s profile.
        </p>
        {matches.length > 0 && (
          <div>
            <p className="label">Did you mean</p>
            <ul className="pmissing__list">
              {matches.map((m) => (
                <li key={m.place.id}>
                  <Link to={`/place/${m.place.id}`}>
                    <strong>{m.place.name}</strong>
                    <span>{describeMatch(m)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="cluster">
          <ButtonLink to="/" variant="primary" icon="map">
            Find a place on the map
          </ButtonLink>
          <ButtonLink to="/insights" variant="outline">
            Read the insights
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

function Profile({ place }: { place: Place }) {
  const core = useCore();
  const [noc, setNoc] = useSearchParamState('noc');
  const occupations = useJSON<Occupation[]>('occupations.json');
  const occupation = useMemo(() => (noc ? (occupations.data?.find((o) => o.noc === noc) ?? null) : null), [noc, occupations.data]);
  const wages = useJSON<WageTable>(noc ? 'wages.json' : null);
  const jobs = useJSON<JobSearchConfig>('job_search.json');
  const seriesState = useJSON<Series[]>(`series/${encodeURIComponent(place.id)}.json`);
  const series = seriesState.data;
  const showImm = hasImmigrationData(core);
  const programs = useJSON<ProgramRecord[]>(showImm ? 'programs.json' : null);
  const index = useJSON<InsightSummary[]>(INDEX_PATH);
  const relatedIds = useMemo(() => (index.data ? index.data.filter((i) => i.relatedPlaceIds.includes(place.id)).map((i) => i.id) : null), [index.data, place.id]);
  const insights = useInsightFiles(relatedIds);
  usePageTitle(`${place.name} — ${place.statLabel} — ${PRODUCT.name}`);
  useScrollReset(place.id);

  const showClimate = hasClimateData(core, series);
  const showPeople = hasPeopleData(core);
  const showNeighbourhoods = !!core.manifest.files[`neighbourhoods/${place.id}.json`];

  const sections: NavItem[] = [
    { id: 'facts', label: 'Key facts' },
    { id: 'tradeoffs', label: 'Tradeoffs' },
    { id: 'work', label: 'Work' },
    { id: 'housing', label: 'Housing' },
    ...(showNeighbourhoods ? [{ id: 'neighbourhoods', label: 'Neighbourhoods' }] : []),
    { id: 'cost', label: 'Cost' },
    ...(showClimate ? [{ id: 'climate', label: 'Climate' }] : []),
    ...(showPeople ? [{ id: 'people', label: 'People' }] : []),
    ...(showImm ? [{ id: 'immigration', label: 'Immigration' }] : []),
    { id: 'findings', label: 'Findings' },
    { id: 'sources', label: 'Sources' },
  ];
  const num = (id: string) => String(sections.findIndex((s) => s.id === id) + 1).padStart(2, '0');

  const missing = [
    !showClimate && 'climate normals (Environment and Climate Change Canada, 1991–2020)',
    !showPeople && 'Census 2021 profiles (language, commuting, households, immigrant shares)',
    !showImm && 'immigration admissions and programs',
  ].filter((x): x is string => !!x);

  const sourceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const o of core.obsIndex.get(place.id)?.values() ?? []) ids.add(o.sourceId);
    for (const s of series ?? []) ids.add(s.sourceId);
    if (place.population) ids.add(place.population.sourceId);
    if (place.climateStation) ids.add(place.climateStation.sourceId);
    if (noc && wages.data) ids.add(wages.data.sourceId);
    if (programs.data) for (const p of programsFor(programs.data, place)) ids.add(p.sourceId);
    for (const ins of insights.insights) for (const f of ins.findings) if (f.placeIds.includes(place.id)) f.sourceIds.forEach((id) => ids.add(id));
    return [...ids];
  }, [core.obsIndex, place, series, noc, wages.data, programs.data, insights.insights]);

  const pickProfession = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>('#work input[role="combobox"]');
    document.getElementById('work')?.scrollIntoView({ block: 'start' });
    input?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="place">
      <div className="page place__top">
        <PlaceHero place={place} places={core.places} />
      </div>
      <SectionNav items={sections} label={`Sections of the ${place.name} profile`} />
      <div className="page place__body">
        <ProfileSection id="facts" num={num('facts')} title="Key facts" dek={`The headline numbers for the ${place.statLabel}, each with its period, geography and source.`}>
          <KeyFacts core={core} place={place} occupation={occupation} wages={wages.data} wagesLoading={wages.loading} onPickProfession={pickProfession} />
        </ProfileSection>

        <ProfileSection
          id="tradeoffs"
          num={num('tradeoffs')}
          title="Where it sits"
          dek={`How ${place.name} compares with the other places that publish the same measure for the same period. Facts, not a score.`}
        >
          <Tradeoffs core={core} place={place} />
        </ProfileSection>

        <ProfileSection
          id="work"
          num={num('work')}
          title="Work"
          dek={occupation ? `Pay for ${occupation.title.toLowerCase()} and the local job market.` : 'Pay in your occupation, the local job market and where to search for openings.'}
        >
          <WorkSection
            core={core}
            place={place}
            noc={noc}
            onNoc={(v) => setNoc(v, { replace: true })}
            occupations={occupations}
            occupation={occupation}
            wages={wages}
            jobs={jobs}
            series={series}
            seriesLoading={seriesState.loading}
          />
        </ProfileSection>

        <ProfileSection id="housing" num={num('housing')} title="Housing" dek="What a new lease costs, what sitting tenants pay, vacancy and how rent prices are moving.">
          <HousingSection core={core} place={place} series={series} seriesLoading={seriesState.loading} />
        </ProfileSection>

        {showNeighbourhoods && <ProfileSection id="neighbourhoods" num={num('neighbourhoods')} title="Neighbourhoods" dek="Zoom in from the city to the places you might call home.">
          <NeighbourhoodSection placeId={place.id} name={place.name} />
        </ProfileSection>}

        <ProfileSection id="cost" num={num('cost')} title="Everyday costs" dek="Statistics Canada’s basic-basket benchmark for the area, scaled to your household.">
          <CostSection core={core} place={place} />
        </ProfileSection>

        {showClimate && (
          <ProfileSection id="climate" num={num('climate')} title="Climate" dek="Thirty-year normals from the nearest long-record weather station.">
            <ClimateSection core={core} place={place} series={series} />
          </ProfileSection>
        )}

        {showPeople && (
          <ProfileSection id="people" num={num('people')} title="People & language" dek="Who lives here, the languages they speak and how they get to work — Census 2021.">
            <PeopleSection core={core} place={place} />
          </ProfileSection>
        )}

        {showImm && (
          <ProfileSection id="immigration" num={num('immigration')} title="Immigration" dek="New permanent residents who chose this destination, what happened five years on, and the programs that apply.">
            <ImmigrationSection core={core} place={place} series={series} programs={programs} />
          </ProfileSection>
        )}

        <ProfileSection id="findings" num={num('findings')} title="In the insights" dek={`Findings that mention ${place.name}.`}>
          <PlaceFindings place={place} insights={insights.insights} loading={insights.loading || index.loading} />
        </ProfileSection>

        <ProfileSection id="sources" num={num('sources')} title="Sources & methods" dek="Every source used on this page, with its dates.">
          <PlaceSources core={core} sourceIds={sourceIds} missing={missing} />
        </ProfileSection>
      </div>
    </div>
  );
}
