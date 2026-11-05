import { useMemo, useState } from 'react';
import type { ChartSpec, Occupation, Place, Series, WageTable } from '../../types/contract';
import type { CoreData } from '../../data/core';
import type { Loadable } from '../../data/useJSON';
import { jobSearchLinks, type JobSearchConfig } from '../../adapters/jobs';
import { FULL_TIME_HOURS_PER_WEEK, grossMonthly, rentShareOfPay } from '../../model/pay';
import { formatDate, formatMonthly, formatNumber, formatValue } from '../../lib/format';
import { ChartRenderer } from '../../charts';
import { ProfessionPicker } from '../explore/ProfessionPicker';
import { Badge } from '../ui/Badge';
import { ButtonLink } from '../ui/Button';
import { ToggleChip } from '../ui/Chip';
import { Disclosure } from '../ui/Disclosure';
import { MissingValue } from '../ui/EmptyState';
import { Icon } from '../ui/Icon';
import { SegmentedControl } from '../ui/SegmentedControl';
import { SourceNote } from '../ui/SourceNote';
import { Stat } from '../ui/Stat';
import { GroupSource, ObsStat } from './KeyFacts';
import { findMetric, findSeries, geoName, hasValue, lineSpec, noWageReason, toChartSeries, wagePeriod, wageRows } from './data';

/** "Registered nurses and registered psychiatric nurses" -> "Registered nurses"; one-word heads keep the full title. */
function shortTitle(t: string): string {
  const head = t.split(/\s+and\s+/)[0].replace(/,\s*$/, '');
  return head !== t && head.split(/\s+/).length >= 2 ? head : t;
}

/** Common newcomer occupations offered as one-tap picks (shown only if present in the snapshot). */
const QUICK_NOCS = ['31301', '21232', '33102', '72106', '73300', '13110', '11100', '65200'];

export interface WorkSectionProps {
  core: CoreData;
  place: Place;
  noc: string | null;
  onNoc: (noc: string | null) => void;
  occupations: Loadable<Occupation[]>;
  occupation: Occupation | null;
  wages: Loadable<WageTable>;
  jobs: Loadable<JobSearchConfig>;
  series: Series[] | undefined;
  seriesLoading: boolean;
}

export function WorkSection({ core, place, noc, onNoc, occupations, occupation, wages, jobs, series, seriesLoading }: WorkSectionProps) {
  const quick = useMemo(() => QUICK_NOCS.map((c) => occupations.data?.find((o) => o.noc === c)).filter((o): o is Occupation => !!o), [occupations.data]);
  return (
    <div className="pwork">
      <div className="pwork__col">
        <div className="ppanel">
          <ProfessionPicker
            occupations={occupations.data}
            loading={occupations.loading}
            error={occupations.error}
            noc={noc}
            onChange={onNoc}
            summary={occupation ? `NOC ${occupation.noc} · TEER ${occupation.teer} · ${occupation.broadTitle}` : 'Your choice is kept in the page address, so a shared link keeps it.'}
          />
          {!noc && quick.length > 0 && (
            <div className="pwork__quick" role="group" aria-label="Common newcomer occupations">
              <p className="label">Or try</p>
              <div className="cluster">
                {quick.map((o) => (
                  <ToggleChip key={o.noc} size="sm" pressed={false} onPressedChange={() => onNoc(o.noc)}>
                    {shortTitle(o.title)}
                  </ToggleChip>
                ))}
              </div>
            </div>
          )}
        </div>
        <WagePanel core={core} place={place} occupation={occupation} noc={noc} wages={wages} />
      </div>
      <div className="pwork__col">
        <LabourPanel core={core} place={place} series={series} seriesLoading={seriesLoading} />
        <JobsPanel place={place} occupation={occupation} noc={noc} jobs={jobs} />
      </div>
    </div>
  );
}

function WagePanel({ core, place, occupation, noc, wages }: { core: CoreData; place: Place; occupation: Occupation | null; noc: string | null; wages: Loadable<WageTable> }) {
  if (!noc)
    return (
      <div className="ppanel ppanel--quiet">
        <p className="ppanel__title">Wages in your occupation</p>
        <p className="ppanel__text">
          Pick an occupation to see the low, median and high wages of people employed in it in {place.name}’s economic region, next to the province and Canada,
          with a gross monthly equivalent.
        </p>
      </div>
    );
  if (wages.error) return <MissingValue label="Wages could not be loaded" reason={wages.error.message} />;
  if (!wages.data || !occupation)
    return (
      <div className="ppanel">
        <p className="ppanel__text">{noc && wages.data && !occupation ? `No occupation with NOC code ${noc} in this snapshot.` : 'Loading wages…'}</p>
      </div>
    );
  const table = wages.data;
  const { primary, rows, territoryNoProvince } = wageRows(table, occupation.noc, place);
  const annual = primary?.annual ?? rows.find((r) => r.cell)?.cell?.annual ?? false;
  const unit = annual ? 'CAD_year' : 'CAD_hour';
  const sameBasis = rows.filter((r) => r.cell && r.cell.annual === annual && r.cell.referencePeriod === primary?.referencePeriod && r.cell.methodology === primary?.methodology && !!r.cell.referencePeriod && !!r.cell.methodology && (r.cell.median !== null || r.cell.low !== null));
  const otherBasis = rows.filter((r) => r.cell && !sameBasis.includes(r));
  const primaryKey = primary ? (primary.fallback === 'province' ? 'province' : 'er') : null;
  const spec: ChartSpec = {
    id: `wage-${occupation.noc}`,
    type: 'range',
    title: `${occupation.title}: wages of employed workers`,
    subtitle: `Low, median and high ${annual ? 'annual' : 'hourly'} wage · Job Bank, ${wagePeriod(primary)}`,
    unit,
    series: [
      {
        id: 'wage',
        label: 'Wage',
        points: rows
          .filter((r) => sameBasis.includes(r))
          .map((r) => ({
            x: r.key === 'province' && primaryKey === 'province' ? `${r.label} (used for ${place.name})` : r.label,
            y: r.cell?.median ?? null,
            y0: r.cell?.low ?? null,
            y1: r.cell?.high ?? null,
            placeId: r.key === primaryKey ? place.id : undefined,
            f: r.cell ? r.flags : ['not_available'],
          })),
      },
    ],
    sourceIds: [table.sourceId],
  };
  const monthly = primary ? grossMonthly(primary.median, primary.annual) : null;
  const rentMetric = findMetric(core, ['rent_asking_1br']);
  const rentObs = rentMetric ? core.obsIndex.get(place.id)?.get(rentMetric.id) : undefined;
  const share = hasValue(rentObs) ? rentShareOfPay(rentObs.value, monthly) : null;
  const er = place.geo.economicRegions[0];

  return (
    <div className="ppanel">
      <div className="pwage__head">
        <Stat
          size="lg"
          label={`Median ${annual ? 'annual' : 'hourly'} wage`}
          value={primary?.median ?? null}
          unit={unit}
          period={primary?.referencePeriod ?? 'Not recorded'}
          periodType="period"
          qualifier={primary ? (primary.fallback === 'province' ? `Province-wide value (${geoName(primary.geo.name)}) — no economic-region wage` : `Economic region: ${geoName(primary.geo.name)}`) : null}
          flags={primary ? [primary.fallback === 'province' ? 'provincial_value' : 'regional_value'] : ['not_available']}
          missingReason={primary ? null : noWageReason(place)}
        >
          <p className="pwage__basis">
            <Badge variant="neutral">{annual ? 'Annual wage' : 'Hourly wage'}</Badge> Wages of people employed in the occupation — not advertised pay, and not an offer to
            expect on arrival.
          </p>
        </Stat>
      </div>

      {sameBasis.length > 0 && (
        <ChartRenderer
          spec={spec}
          highlightIds={[place.id]}
          titleLevel={4}
          linkPlaces={false}
          showSource={false}
          footer={
            <p className="ppanel__note">
              ER = economic region, the area Job Bank publishes local wages for.{er ? ` ${place.name} is in the ${geoName(er.name)} economic region.` : ''}
            </p>
          }
        />
      )}
      {otherBasis.length > 0 && (
        <p className="ppanel__note">
          {otherBasis.map((r) => `${r.label}: ${wagePeriod(r.cell)}, ${r.cell?.annual ? 'annual' : 'hourly'}, ${r.cell?.methodology ?? 'method not recorded'}`).join('; ')}. Left out of the chart because units, reference periods or methods differ or are unknown.
        </p>
      )}
      {primary?.fallback === 'province' && (
        <p className="ppanel__note">
          Job Bank publishes no wage for this occupation in the {er ? geoName(er.name) : ''} economic region, so the province-wide value stands in (flagged).
        </p>
      )}
      {territoryNoProvince && <p className="ppanel__note">Job Bank publishes no separate territory-wide row; the economic region covers the whole territory.</p>}

      <div className="pwage__calc">
        <div className="pwage__calc-head">
          <Badge variant="estimate">Calculation</Badge>
          <p className="label">Gross monthly equivalent</p>
        </div>
        {monthly !== null ? (
          <>
            <p className="pwage__monthly num">
              {formatMonthly(monthly)}
              <span className="pwage__assume"> at {formatNumber(FULL_TIME_HOURS_PER_WEEK, 1)} hours a week</span>
            </p>
            <p className="pwage__how mono">
              {annual
                ? `${formatValue(primary!.median, 'CAD_year')} ÷ 12 = ${formatMonthly(monthly)}`
                : `${formatValue(primary!.median, 'CAD_hour')} × ${formatNumber(FULL_TIME_HOURS_PER_WEEK, 1)} h × 52 weeks ÷ 12 = ${formatMonthly(monthly)}`}
            </p>
            <p className="ppanel__text">
              Gross pay of employed workers before tax and deductions — not advertised pay and not take-home pay. The {formatNumber(FULL_TIME_HOURS_PER_WEEK, 1)}-hour full-time
              week is our assumption{annual ? ' (not needed for an annual wage)' : ''}.
            </p>
            {share !== null && rentMetric && hasValue(rentObs) && (
              <p className="pwage__share">
                A 1-bedroom asking rent of <strong className="num">{formatValue(rentObs.value, rentMetric.unit)}</strong> would take{' '}
                <strong className="num">{formatNumber(share * 100, 0)}%</strong> of that gross monthly pay. Rent and wage periods differ; the wage describes the economic region.{' '}
                <ButtonLink to={`/?metric=rent_share&noc=${occupation.noc}&unit=1br&place=${place.id}`} size="sm" variant="ghost" iconRight="arrowRight">
                  Compare on the map
                </ButtonLink>
              </p>
            )}
          </>
        ) : (
          <MissingValue compact reason="Needs a median wage for the occupation." />
        )}
      </div>
      <p className="ppanel__note">Method: {primary?.methodology ?? 'Not recorded'}</p>
      <SourceNote sourceId={table.sourceId} period={primary?.referencePeriod ?? 'Not recorded'} periodType="period" />
    </div>
  );
}

function LabourPanel({ core, place, series, seriesLoading }: { core: CoreData; place: Place; series: Series[] | undefined; seriesLoading: boolean }) {
  const [which, setWhich] = useState<'lfs_unemployment_rate' | 'lfs_employment_rate'>('lfs_unemployment_rate');
  const ur = findMetric(core, ['lfs_unemployment_rate']);
  const er = findMetric(core, ['lfs_employment_rate']);
  const chg = findMetric(core, ['lfs_unemployment_rate_change_1y']);
  const chgObs = chg ? core.obsIndex.get(place.id)?.get(chg.id) : undefined;
  const metric = which === 'lfs_unemployment_rate' ? ur : er;
  const s = findSeries(series, which);
  const basis = [
    'Labour Force Survey',
    metric?.periodType === 'three_month_avg' ? 'three-month moving average' : null,
    metric?.seasonalAdjustment === 'seasonally_adjusted' ? 'seasonally adjusted' : metric?.seasonalAdjustment === 'unadjusted' ? 'not seasonally adjusted' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const spec: ChartSpec | null = s
    ? lineSpec({
        id: `lfs-${which}`,
        title: `${metric?.shortLabel ?? s.label} since ${s.points[0]?.t.slice(0, 4) ?? ''}`,
        subtitle: `${geoName(s.geo.name)} · ${basis}`,
        unit: s.unit,
        series: [toChartSeries(s, place.name, place.id)],
        sourceIds: [s.sourceId],
        notes: 'The 2020 spike reflects the pandemic. Small areas have wider sampling error: treat moves of a few tenths of a point as noise.',
      })
    : null;
  return (
    <div className="ppanel">
      <p className="ppanel__title">The local job market</p>
      <div className="pstats pstats--2">
        <ObsStat core={core} place={place} metric={ur} label="Unemployment rate" source={false}>
          {hasValue(chgObs) && chg && <p className="pfacts__extra num">{formatValue(chgObs.value, chg.unit, chg.decimals)} vs a year earlier</p>}
        </ObsStat>
        <ObsStat core={core} place={place} metric={er} label="Employment rate" source={false} />
      </div>
      <GroupSource core={core} place={place} metrics={[ur, er]} />
      <p className="ppanel__note">{basis}. Rates are for people aged 15 and over.</p>
      {spec ? (
        <ChartRenderer
          spec={spec}
          titleLevel={4}
          periodType={metric?.periodType}
          linkPlaces={false}
          highlightIds={[place.id]}
          height={220}
          controls={
            <SegmentedControl
              label="Labour market measure"
              size="sm"
              value={which}
              onChange={setWhich}
              options={[
                { value: 'lfs_unemployment_rate', label: 'Unemployment' },
                { value: 'lfs_employment_rate', label: 'Employment' },
              ]}
            />
          }
        />
      ) : seriesLoading ? (
        <p className="ppanel__text">Loading history…</p>
      ) : (
        <MissingValue compact label="No history" reason="No Labour Force Survey series for this place in the snapshot." />
      )}
    </div>
  );
}

function JobsPanel({ place, occupation, noc, jobs }: { place: Place; occupation: Occupation | null; noc: string | null; jobs: Loadable<JobSearchConfig> }) {
  const config = jobs.data;
  const links = jobSearchLinks({ noc: noc ?? undefined, occupationTitle: occupation?.title, place }, config);
  const hasCity = !!config?.placeLocations?.[place.id]?.jbCityId;
  const feed = config?.feedStatus;
  // Template labels carry the same placeholders as the URLs ({query}, {city}, {noc}).
  const city = config?.placeLocations?.[place.id]?.label?.replace(/\s*\([A-Z]{2}\)$/, '') ?? place.name;
  const fillLabel = (t: string) =>
    t
      .replace(/\{query\}/g, occupation?.title ?? 'your occupation')
      .replace(/\{city\}/g, city)
      .replace(/\{noc\}/g, noc ?? 'NOC')
      .replace(/\{province\}/g, place.province);
  return (
    <div className="ppanel">
      <p className="ppanel__title">Look for openings</p>
      <p className="ppanel__text">
        {feed?.currentPostingsFeed === 'available'
          ? 'Current postings come from a permitted feed.'
          : 'No live job postings are shown here. Job Bank does not allow automated collection and offers no public postings API, so these links open Job Bank’s own searches in a new tab.'}
      </p>
      <ul className="pjobs">
        {links.map((l) => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noreferrer noopener" className="pjobs__link">
              <span className="pjobs__label">{fillLabel(l.label)}</span>
              <Icon name="external" size={16} />
            </a>
            <p className="pjobs__desc">{l.description}</p>
            {l.verifiedAt && <p className="pjobs__meta mono">Link pattern checked {formatDate(l.verifiedAt)}</p>}
          </li>
        ))}
      </ul>
      {!occupation && <p className="ppanel__note">Choose a profession above to add searches for it{hasCity ? ` near ${place.name}` : ''}.</p>}
      {occupation && !hasCity && config && (
        <p className="ppanel__note">Job Bank has no city location recorded for {place.name} in this snapshot, so only Canada-wide searches are offered.</p>
      )}
      <Disclosure summary="About the “open to international candidates” filter" variant="plain" className="pjobs__more">
        <div className="ppanel__text">
          <p>
            Employers decide whether to mark a posting as open to candidates outside Canada. A posting without the mark is not proof the job is closed to you, and every
            posting still has its own requirements — check them on Job Bank.
          </p>
          {feed?.explanation && <p className="pjobs__feed">{feed.explanation}</p>}
        </div>
      </Disclosure>
      {jobs.error && <p className="ppanel__note">Job search settings could not be loaded ({jobs.error.message}); the general Job Bank page is still linked.</p>}
    </div>
  );
}
