import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCore } from '../data/core';
import { useJSON } from '../data/useJSON';
import type { MetricDef, Occupation, Place, ProvinceCode, RegionCode, WageTable } from '../types/contract';
import { CanadaMap, populationRadius, type MapMarker } from '../components/map/CanadaMap';
import { MapLegend } from '../components/map/MapLegend';
import { useCanadaGeo } from '../components/map/geo';
import { MetricSwitcher, type VariantControl, type VirtualLayer } from '../components/explore/MetricSwitcher';
import { ProfessionPicker } from '../components/explore/ProfessionPicker';
import { QuestionPresets, type QuestionPreset } from '../components/explore/QuestionPresets';
import { RankExtremes } from '../components/explore/RankExtremes';
import { RegionChips, WhereFilters } from '../components/explore/WhereFilters';
import { ResultsList, type SortMode } from '../components/explore/ResultsList';
import { PlaceDetail, PlacePeek, PlaceTooltip } from '../components/explore/PlaceDetail';
import { Button } from '../components/ui/Button';
import { ToggleChip } from '../components/ui/Chip';
import { Drawer } from '../components/ui/Drawer';
import { Icon } from '../components/ui/Icon';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Sheet } from '../components/ui/Sheet';
import { buildClassScale } from '../lib/colors';
import { formatPeriod, formatValue, plural } from '../lib/format';
import { useIsMobile } from '../lib/hooks';
import {
  buildLayerCatalog,
  buildMetricLayer,
  buildRentShareLayer,
  buildWageLayer,
  CATEGORY_LABELS,
  HOURS_PER_WEEK,
  keyObservations,
  monthIndex,
  MONTHS_LONG,
  pickVariant,
  RENT_SHARE_KEY,
  rentFamily,
  rentShareMetric,
  resolveLayer,
  unitTypeShort,
  unitTypeSlug,
  WAGE_LAYER_KEY,
  wageMetric,
  type LayerCatalog,
  type LayerData,
  type LayerEntry,
} from '../lib/layers';
import { boxAround, PROVINCES, REGION_BY_CODE, regionLabel, provinceName } from '../lib/places';
import { parseIdList, useCompareTray, useFavourites, useUrlState, type ParamPatch } from '../lib/state';

const PENDING_FILL = '#d9cbbb';
const DRAWER_W = 380;
const SHEET_PEEK = 196;
/** Height reserved for the legend docked at the top of the map on phones. */
const MOBILE_LEGEND_H = 124;
const PLACEHOLDER_TABLE: WageTable = { sourceId: '', referencePeriod: '', geos: {}, byNoc: {} };

const isRegion = (v: string | null): v is RegionCode => !!v && REGION_BY_CODE.has(v as RegionCode);
const isProv = (v: string | null): v is ProvinceCode => !!v && v in PROVINCES;

/** A January temperature layer, as a month family or a plain metric. */
function januaryLayer(catalog: LayerCatalog): ParamPatch | null {
  const fam = catalog.entries.find((e) => e.dim === 'month' && e.category === 'climate' && /temp/i.test(e.label));
  if (fam && fam.variants.some((v) => monthIndex(v.dims?.month) === 1)) return { metric: fam.key, month: '01' };
  const jan = catalog.entries.find((e) => e.category === 'climate' && /jan/i.test(e.key) && /temp/i.test(e.key));
  return jan ? { metric: jan.key } : null;
}

export default function ExplorePage() {
  const core = useCore();
  const [params, update] = useUrlState();
  const isMobile = useIsMobile();
  const favourites = useFavourites();
  const compare = useCompareTray();
  const { geo, error: geoError } = useCanadaGeo();
  const catalog = useMemo(() => buildLayerCatalog(core.metrics), [core.metrics]);
  const rentFam = useMemo(() => rentFamily(catalog), [catalog]);
  const occupations = useJSON<Occupation[]>('occupations.json');

  // ---------------------------------------------------------------- URL state
  const metricParam = params.get('metric');
  const unitParam = params.get('unit');
  const monthParam = params.get('month');
  const noc = params.get('noc');
  const regionRaw = params.get('region');
  const provRaw = params.get('prov');
  const region = isRegion(regionRaw) ? regionRaw : null;
  const prov = isProv(provRaw) ? provRaw : null;
  const placeRaw = params.get('place');
  const placeId = placeRaw && core.placeById.has(placeRaw) ? placeRaw : null;
  const highlightRaw = params.get('highlight');
  const highlight = useMemo(() => parseIdList(highlightRaw).filter((id) => core.placeById.has(id)), [highlightRaw, core.placeById]);
  const fromText = params.get('from');

  // ---------------------------------------------------------------- layers
  const occupation = useMemo(() => (noc ? (occupations.data?.find((o) => o.noc === noc) ?? null) : null), [noc, occupations.data]);
  const nocInvalid = !!noc && !!occupations.data && !occupation;
  const nocOk = !!noc && !nocInvalid;
  const wages = useJSON<WageTable>(nocOk ? 'wages.json' : null);
  const wageActive = metricParam === WAGE_LAYER_KEY && nocOk;
  const shareActive = metricParam === RENT_SHARE_KEY && nocOk && !!rentFam;
  const virtualActive = wageActive || shareActive;
  const occLike = useMemo(() => (noc ? { noc, title: occupation?.title ?? `NOC ${noc}` } : null), [noc, occupation]);

  const resolved = useMemo(
    () => resolveLayer(catalog, metricParam === WAGE_LAYER_KEY || metricParam === RENT_SHARE_KEY ? null : metricParam, unitParam, monthParam),
    [catalog, metricParam, unitParam, monthParam],
  );
  const metricLayer = useMemo(() => (!virtualActive && resolved.metric ? buildMetricLayer(resolved.metric, core.places, core.obsIndex) : null), [virtualActive, resolved.metric, core.places, core.obsIndex]);
  const wageLayer = useMemo(() => (wages.data && occupation ? buildWageLayer(wages.data, occupation, core.places) : null), [wages.data, occupation, core.places]);
  const rentMetric = useMemo(() => (rentFam ? pickVariant(rentFam, unitParam) : null), [rentFam, unitParam]);
  const shareLayer = useMemo(() => {
    if (!shareActive || !rentMetric || !wageLayer || !occupation) return null;
    return buildRentShareLayer(buildMetricLayer(rentMetric, core.places, core.obsIndex), wageLayer, occupation, core.places);
  }, [shareActive, rentMetric, wageLayer, occupation, core.places, core.obsIndex]);

  const pending = virtualActive && !wageLayer && !wages.error;
  const layer: LayerData | null = wageActive ? wageLayer : shareActive ? shareLayer : metricLayer;
  const metric: MetricDef | null = useMemo(() => {
    if (wageActive) return wageLayer?.metric ?? wageMetric(occLike!, PLACEHOLDER_TABLE, false);
    if (shareActive) return shareLayer?.metric ?? rentShareMetric(occLike!, rentMetric!, '');
    return resolved.metric;
  }, [wageActive, shareActive, wageLayer, shareLayer, occLike, rentMetric, resolved.metric]);
  const scale = useMemo(() => (layer ? buildClassScale(layer.metric, [...layer.data.values()].map((d) => d.value)) : null), [layer]);

  const variant: VariantControl = useMemo(() => {
    if (shareActive && rentFam && rentMetric) return { kind: 'unitType', entry: rentFam, value: unitTypeSlug(rentMetric.dims?.unitType ?? '') };
    if (virtualActive || !resolved.entry) return null;
    if (resolved.entry.dim === 'unitType' && resolved.entry.variants.length > 1) return { kind: 'unitType', entry: resolved.entry, value: unitTypeSlug(resolved.unitType ?? '') };
    if (resolved.entry.dim === 'month') return { kind: 'month', entry: resolved.entry, value: resolved.month ?? 1 };
    return null;
  }, [shareActive, rentFam, rentMetric, virtualActive, resolved]);

  // ---------------------------------------------------------------- filters, highlight, framing
  const inFilter = useCallback((p: Place) => (!region || p.region === region) && (!prov || p.province === prov), [region, prov]);
  const filtered = useMemo(() => core.places.filter(inFilter), [core.places, inFilter]);
  const dimmedIds = useMemo(() => (region || prov ? new Set(core.places.filter((p) => !inFilter(p)).map((p) => p.id)) : null), [core.places, inFilter, region, prov]);
  const highlightIds = useMemo(() => (highlight.length ? new Set(highlight) : null), [highlight]);
  const frame = useMemo(() => {
    if (prov) return boxAround(core.places.filter((p) => p.province === prov));
    if (region) return REGION_BY_CODE.get(region)?.frame ?? null;
    if (highlight.length) return boxAround(highlight.map((id) => core.placeById.get(id)!));
    return null;
  }, [prov, region, highlight, core.places, core.placeById]);
  const frameKey = `${region ?? ''}|${prov ?? ''}|${highlight.join(',')}`;
  const filterLabel = prov ? provinceName(prov) : region ? regionLabel(region) : null;

  // ---------------------------------------------------------------- interaction state
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [sort, setSort] = useState<SortMode>('auto');
  const [view, setView] = useState<'map' | 'list'>('map');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(t);
  }, [notice]);
  useEffect(() => setSheetExpanded(false), [placeId]);
  useEffect(() => setSort('auto'), [metric?.id]);

  const selectPlace = useCallback(
    (id: string | null, via: 'pointer' | 'keyboard' = 'pointer') => {
      update({ place: id });
      if (id && via === 'keyboard') setFocusKey(Date.now());
    },
    [update],
  );
  const onCompareFull = useCallback(() => setNotice('Compare holds three places. Remove one to add another.'), []);
  const chooseEntry = useCallback((e: LayerEntry) => update({ metric: e.key }), [update]);
  const chooseUnit = useCallback((slug: string) => update(shareActive ? { unit: slug } : { metric: resolved.entry?.key ?? null, unit: slug }), [update, shareActive, resolved.entry]);
  const chooseMonth = useCallback((slug: string) => update({ metric: resolved.entry?.key ?? null, month: slug }), [update, resolved.entry]);
  const chooseNoc = useCallback(
    (code: string | null) => {
      if (code) update({ noc: code, metric: metricParam === RENT_SHARE_KEY ? RENT_SHARE_KEY : WAGE_LAYER_KEY });
      else update({ noc: null, metric: virtualActive || metricParam === WAGE_LAYER_KEY || metricParam === RENT_SHARE_KEY ? null : metricParam });
    },
    [update, metricParam, virtualActive],
  );

  const virtuals: VirtualLayer[] = occupation
    ? [
        {
          key: WAGE_LAYER_KEY,
          category: 'work',
          label: `Median wage: ${occupation.title}`,
          title: `Median wage of people employed as ${occupation.title.toLowerCase()}, by economic region`,
          tag: 'ER',
          active: wageActive,
          onSelect: () => update({ metric: WAGE_LAYER_KEY }),
        },
        ...(rentFam
          ? [
              {
                key: RENT_SHARE_KEY,
                category: 'housing' as const,
                label: `Rent ÷ pay: ${occupation.title}`,
                title: `Asking rent as a share of gross monthly pay at the median wage (${HOURS_PER_WEEK} h a week)`,
                tag: 'Calc',
                active: shareActive,
                onSelect: () => update({ metric: RENT_SHARE_KEY }),
              },
            ]
          : []),
      ]
    : [];

  // ---------------------------------------------------------------- question presets
  const presets = useMemo<QuestionPreset[]>(() => {
    const known = (code: string) => !occupations.data || occupations.data.some((o) => o.noc === code);
    const out: Omit<QuestionPreset, 'active'>[] = [];
    const reset: ParamPatch = { region: null, prov: null, highlight: null, from: null };
    if (rentFam && known('31301')) out.push({ id: 'nurse', label: 'Can a nurse afford a one-bedroom?', params: { ...reset, metric: RENT_SHARE_KEY, noc: '31301', unit: '1br' } });
    const jan = januaryLayer(catalog);
    if (jan) out.push({ id: 'winter', label: 'Where are winters mildest?', params: { ...reset, ...jan } });
    if (catalog.byKey.has('lfs_unemployment_rate')) out.push({ id: 'jobs', label: 'Where is work easiest to find?', params: { ...reset, metric: 'lfs_unemployment_rate' } });
    const french = catalog.entries.find((e) => /french/i.test(`${e.key} ${e.label}`));
    if (french) out.push({ id: 'french', label: 'Where can I live in French?', params: { ...reset, metric: french.key } });
    if (rentFam?.variants.some((v) => v.dims?.unitType === '3 bedroom+')) out.push({ id: 'family', label: 'Room for a family: 3+ bedroom rents', params: { ...reset, metric: rentFam.key, unit: '3br' } });
    const pilots = core.places.filter((p) => p.programTags?.some((t) => t === 'rcip' || t === 'fcip')).map((p) => p.id);
    if (pilots.length) out.push({ id: 'pilots', label: 'Smaller places with community pilots', params: { region: null, prov: null, highlight: pilots, from: 'Smaller places with community immigration pilots' } });
    const same = (k: string, v: unknown) => {
      const cur = params.get(k);
      if (v === null || v === undefined) return cur === null;
      return cur === (Array.isArray(v) ? v.join(',') : String(v));
    };
    return out.map((p) => ({ ...p, active: Object.entries(p.params).every(([k, v]) => same(k, v)) }));
  }, [catalog, rentFam, occupations.data, core.places, params]);

  // ---------------------------------------------------------------- map inputs
  const radius = useMemo(() => populationRadius(core.places), [core.places]);
  const markers = useMemo<MapMarker[]>(
    () =>
      core.places.map((p) => {
        const d = layer?.data.get(p.id);
        const fill = pending ? PENDING_FILL : d && d.value !== null && scale ? scale.color(d.value) : null;
        let valueText = 'no comparable data';
        if (pending) valueText = 'loading';
        else if (d && d.shown !== null && metric)
          valueText = `${formatValue(d.shown, d.shownUnit, d.shownUnit === metric.unit ? metric.decimals : undefined)}, ${formatPeriod(d.period, metric.periodType)}${d.status !== 'ok' && d.reason ? ` (${d.reason})` : ''}`;
        else if (d?.reason) valueText = `no comparable data (${d.reason})`;
        return {
          id: p.id,
          name: p.name,
          lon: p.lon,
          lat: p.lat,
          r: radius(p),
          fill,
          priority: p.population?.value ?? 0,
          ariaLabel: `${p.name}, ${p.statLabel}. ${metric?.shortLabel ?? ''}: ${valueText}`,
        };
      }),
    [core.places, layer, scale, pending, metric, radius],
  );
  const renderTooltip = useCallback(
    (id: string) => {
      const p = core.placeById.get(id);
      return p ? <PlaceTooltip place={p} metric={metric} datum={layer?.data.get(id)} layer={layer} pending={pending} /> : null;
    },
    [core.placeById, metric, layer, pending],
  );
  const cmaFill = useCallback(
    (id: string) => {
      const d = layer?.data.get(id);
      return d && d.value !== null && scale ? scale.color(d.value) : null;
    },
    [layer, scale],
  );

  const place = placeId ? core.placeById.get(placeId)! : null;
  const datum = place ? layer?.data.get(place.id) : undefined;
  const keyObs = useMemo(
    () =>
      placeId
        ? keyObservations(placeId, core.metrics, core.obsIndex, {
            exclude: virtualActive ? [] : (resolved.entry?.variants.map((v) => v.id) ?? []),
            preferUnitType: shareActive ? rentMetric?.dims?.unitType : resolved.unitType,
            limit: 6,
          })
        : [],
    [placeId, core.metrics, core.obsIndex, virtualActive, shareActive, rentMetric, resolved.entry, resolved.unitType],
  );
  const insets = useMemo(
    () => (isMobile ? { top: MOBILE_LEGEND_H, bottom: place ? SHEET_PEEK : 0 } : place ? { right: DRAWER_W } : undefined),
    [place, isMobile],
  );
  const rows = useMemo(() => filtered.map((p) => ({ place: p, datum: layer?.data.get(p.id) })), [filtered, layer]);

  // ---------------------------------------------------------------- copy
  let entryTitle = resolved.entry?.label ?? metric?.shortLabel ?? 'Map';
  let entrySub: string | null = resolved.unitType ? unitTypeShort(resolved.unitType) : resolved.month ? MONTHS_LONG[resolved.month - 1] : null;
  if (wageActive) {
    entryTitle = 'Median wage';
    entrySub = occLike?.title ?? null;
  } else if (shareActive) {
    entryTitle = 'Rent ÷ gross pay';
    entrySub = `${rentMetric?.dims?.unitType ? `${unitTypeShort(rentMetric.dims.unitType)} · ` : ''}${occLike?.title ?? ''}`;
  }
  const periodText = layer?.periods.length ? layer.periods.map((p) => formatPeriod(p.period, metric?.periodType)).join(', ') : '';
  const wageSummary =
    occupation && wageLayer ? (
      <>
        Wages of people employed in this occupation, by <strong>economic region (ER value)</strong> — Job Bank. Each value keeps its own reference period and methodology; regional values are not city ranks.{' '}
        {coverageLine(wageLayer)}
      </>
    ) : occupation && wages.loading ? (
      'Loading wages…'
    ) : wages.error ? (
      `Wages could not be loaded (${wages.error.message}).`
    ) : (
      'Adds two layers: the median wage in each economic region, and asking rent as a share of that pay.'
    );

  const detailProps = place
    ? {
        place,
        metric,
        layer,
        datum,
        scale,
        pending,
        wageLayer,
        wageActive,
        occupation,
        wagesLoading: wages.loading,
        keyObs,
        compare,
        favourites,
        onCompareFull,
      }
    : null;

  return (
    <div className={['explore', isMobile && `explore--${view}`, isMobile && filtersOpen && 'filters-open', place && 'has-selection'].filter(Boolean).join(' ')}>
      <aside className="xp" aria-label="Explorer controls and place list">
        <div className="xp__intro">
          <p className="xp__kicker">
            {plural(core.places.length, 'Canadian city', 'Canadian cities')} on one honest scale — every number traced to the official table it came from.
          </p>
        </div>

        <div className="xp__mobilebar">
          <button type="button" className="xp__filters-btn" aria-expanded={filtersOpen} aria-controls="xp-controls" onClick={() => setFiltersOpen((o) => !o)}>
            <span className="label">Layer</span>
            <span className="xp__filters-current">
              {entryTitle}
              {entrySub && <span className="xp__filters-sub"> · {entrySub}</span>}
            </span>
            <Icon name={filtersOpen ? 'chevronUp' : 'chevronDown'} size={16} />
          </button>
          <SegmentedControl
            label="View"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'map', label: 'Map' },
              { value: 'list', label: 'List' },
            ]}
          />
        </div>

        <div id="xp-controls" className="xp__controls">
          <section className="xp__section xp__section--questions" aria-labelledby="xp-q-h">
            <h2 id="xp-q-h" className="xp__h">
              Start with a question
            </h2>
            <QuestionPresets presets={presets} onApply={(p) => update(p.params)} />
          </section>

          <section className="xp__section" aria-labelledby="xp-layer-h">
            <h2 id="xp-layer-h" className="xp__h">
              Map layer
            </h2>
            <MetricSwitcher
              catalog={catalog}
              activeKey={resolved.entry?.key ?? null}
              activeMetric={virtualActive ? metric : resolved.metric}
              onSelectEntry={chooseEntry}
              onUnitChange={chooseUnit}
              onMonthChange={chooseMonth}
              virtuals={virtuals}
              variant={variant}
            />
            {metric && <p className="xp__desc">{metric.description}</p>}
          </section>

          <section className="xp__section" aria-labelledby="xp-prof-h">
            <h2 id="xp-prof-h" className="xp__h">
              Profession lens
            </h2>
            <ProfessionPicker occupations={occupations.data} loading={occupations.loading} error={occupations.error} noc={noc} onChange={chooseNoc} summary={wageSummary} />
            {occupation && (
              <div className="profession__layers" role="group" aria-label="Show the profession on the map as">
                <ToggleChip size="sm" pressed={wageActive} onPressedChange={() => update({ metric: WAGE_LAYER_KEY })}>
                  Median wage
                </ToggleChip>
                {rentFam && (
                  <ToggleChip size="sm" pressed={shareActive} onPressedChange={() => update({ metric: RENT_SHARE_KEY })}>
                    Rent ÷ pay
                  </ToggleChip>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="xp__results">
          <ResultsList
            rows={rows}
            metric={metric}
            layer={layer}
            scale={scale}
            pending={pending}
            selectedId={placeId}
            hoveredId={hoverId}
            highlightIds={highlightIds}
            onSelect={selectPlace}
            onHover={setHoverId}
            compare={compare}
            favourites={favourites}
            onCompareFull={onCompareFull}
            sort={sort}
            onSortChange={setSort}
            totalPlaces={core.places.length}
            filterLabel={filterLabel}
            onClearFilters={() => update({ region: null, prov: null })}
            filters={
              <div className="xp__filters">
                <div className="xp__regions">
                  <RegionChips region={region} onRegion={(r) => update({ region: r, prov: null })} places={core.places} />
                </div>
                <div className="xp__where">
                  <WhereFilters region={region} prov={prov} onProv={(p) => update({ prov: p })} places={core.places} onPick={(id) => selectPlace(id, 'pointer')} />
                </div>
              </div>
            }
            extremes={!pending && <RankExtremes rows={rows} metric={metric} scale={scale} selectedId={placeId} onSelect={selectPlace} onHover={setHoverId} />}
          />
        </div>
      </aside>

      <section className="xp-map" aria-label="Map">
        <CanadaMap
          geo={geo}
          geoError={geoError}
          markers={markers}
          selectedId={placeId}
          hoveredId={hoverId}
          highlightIds={highlightIds}
          dimmedIds={dimmedIds}
          onSelect={selectPlace}
          onHover={setHoverId}
          renderTooltip={renderTooltip}
          frame={frame}
          frameKey={frameKey}
          insets={insets}
          fitPadding={isMobile ? { top: MOBILE_LEGEND_H, bottom: 20, left: 16, right: 16 } : undefined}
          label={`Map of Canada: ${metric?.label ?? 'places'}`}
          cmaFill={cmaFill}
          className={highlightIds ? 'has-banner' : undefined}
        >
          <div className="map-title">
            <p className="label">
              {metric ? CATEGORY_LABELS[metric.category] : 'Layer'} · {filterLabel ?? 'All Canada'}
            </p>
            <h1 className="map-title__h">
              {entryTitle}
              {entrySub && <span className={['map-title__sub', entrySub.length > 34 && 'map-title__sub--long'].filter(Boolean).join(' ')}>{entrySub}</span>}
            </h1>
            {periodText && <p className="map-title__period mono">{periodText}</p>}
          </div>

          {highlightIds && (
            <div className="map-banner" role="status">
              <span className="map-banner__text">
                Showing {plural(highlight.length, 'place')}
                {fromText ? (
                  <>
                    {' '}
                    from: <strong>{fromText.slice(0, 160)}</strong>
                  </>
                ) : null}
              </span>
              <Button size="sm" variant="ghost" icon="close" className="map-banner__close" onClick={() => update({ highlight: null, from: null })}>
                Show all
              </Button>
            </div>
          )}

          {metric && (
            <MapLegend
              metric={metric}
              layer={layer}
              scale={scale}
              pending={pending}
              title={
                wageActive
                  ? `${metric.shortLabel} · NOC ${noc}`
                  : shareActive
                    ? `${metric.shortLabel}${rentMetric?.dims?.unitType ? ` · ${unitTypeShort(rentMetric.dims.unitType)}` : ''}`
                    : undefined
              }
              compact={isMobile || !!place}
              className="map__legend"
            />
          )}

          {!isMobile && detailProps && (
            <Drawer open label={`${detailProps.place.name} details`} onClose={() => selectPlace(null)} focusKey={focusKey} closeLabel="Close details">
              <PlaceDetail {...detailProps} />
            </Drawer>
          )}
        </CanadaMap>
      </section>

      {isMobile && detailProps && (
        <Sheet
          open
          label={`${detailProps.place.name} details`}
          onClose={() => selectPlace(null)}
          expanded={sheetExpanded}
          onExpandedChange={setSheetExpanded}
          focusKey={focusKey}
          peek={<PlacePeek {...detailProps} />}
        >
          <PlaceDetail {...detailProps} hideHeader hideActions />
        </Sheet>
      )}

      <div className="toast" role="status" aria-live="polite">
        {notice && <p className="toast__msg">{notice}</p>}
      </div>
    </div>
  );
}

function coverageLine(layer: LayerData) {
  let province = 0;
  for (const d of layer.data.values()) if (d.shown !== null && d.flags.includes('provincial_value')) province++;
  const withValue = [...layer.data.values()].filter((d) => d.shown !== null).length;
  const parts = [`Values for ${withValue} of ${layer.counts.total} places`];
  if (province) parts.push(`${province} use a province-wide value (no ER cell)`);
  if (layer.counts.notComparable) parts.push(`${layer.counts.notComparable} shown as context, outside city rankings`);
  return parts.join('; ') + '.';
}
