import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCore } from '../data/core';
import { useJSON } from '../data/useJSON';
import type { MetricDef, Occupation, Place, ProvinceCode, RegionCode, WageTable } from '../types/contract';
import { CanadaMap, populationRadius, type MapMarker } from '../components/map/CanadaMap';
import { MapLegend } from '../components/map/MapLegend';
import { useCanadaGeo } from '../components/map/geo';
import { MetricSwitcher } from '../components/explore/MetricSwitcher';
import { ProfessionPicker } from '../components/explore/ProfessionPicker';
import { RegionChips, WhereFilters } from '../components/explore/WhereFilters';
import { ResultsList, type SortMode } from '../components/explore/ResultsList';
import { PlaceDetail, PlacePeek, PlaceTooltip } from '../components/explore/PlaceDetail';
import { Button } from '../components/ui/Button';
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
  buildWageLayer,
  CATEGORY_LABELS,
  keyObservations,
  resolveLayer,
  unitTypeShort,
  WAGE_LAYER_KEY,
  wageMetric,
  type LayerEntry,
} from '../lib/layers';
import { boxAround, PROVINCES, REGION_BY_CODE, regionLabel, provinceName } from '../lib/places';
import { parseIdList, useCompareTray, useFavourites, useUrlState } from '../lib/state';

const PENDING_FILL = '#d8cfbf';
const DRAWER_W = 380;
const SHEET_PEEK = 196;

const isRegion = (v: string | null): v is RegionCode => !!v && REGION_BY_CODE.has(v as RegionCode);
const isProv = (v: string | null): v is ProvinceCode => !!v && v in PROVINCES;

export default function ExplorePage() {
  const core = useCore();
  const [params, update] = useUrlState();
  const isMobile = useIsMobile();
  const favourites = useFavourites();
  const compare = useCompareTray();
  const { geo, error: geoError } = useCanadaGeo();
  const catalog = useMemo(() => buildLayerCatalog(core.metrics), [core.metrics]);
  const occupations = useJSON<Occupation[]>('occupations.json');

  // ---------------------------------------------------------------- URL state
  const metricParam = params.get('metric');
  const unitParam = params.get('unit');
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
  const wages = useJSON<WageTable>(noc && !nocInvalid ? 'wages.json' : null);
  const wageActive = metricParam === WAGE_LAYER_KEY && !!noc && !nocInvalid;

  const resolved = useMemo(() => resolveLayer(catalog, metricParam === WAGE_LAYER_KEY ? null : metricParam, unitParam), [catalog, metricParam, unitParam]);
  const metricLayer = useMemo(() => (resolved.metric ? buildMetricLayer(resolved.metric, core.places, core.obsIndex) : null), [resolved.metric, core.places, core.obsIndex]);
  const wageLayer = useMemo(() => (wages.data && occupation ? buildWageLayer(wages.data, occupation, core.places) : null), [wages.data, occupation, core.places]);
  const pending = wageActive && !wageLayer && !wages.error;
  const layer = wageActive ? wageLayer : metricLayer;
  const metric: MetricDef | null = useMemo(() => {
    if (!wageActive) return resolved.metric;
    if (wageLayer) return wageLayer.metric;
    return wageMetric({ noc: noc!, title: occupation?.title ?? `NOC ${noc}` }, { sourceId: 'jobbank', referencePeriod: '', geos: {}, byNoc: {} }, false);
  }, [wageActive, wageLayer, resolved.metric, noc, occupation]);
  const scale = useMemo(() => (layer ? buildClassScale(layer.metric, [...layer.data.values()].map((d) => d.value)) : null), [layer]);

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

  const selectPlace = useCallback(
    (id: string | null, via: 'pointer' | 'keyboard' = 'pointer') => {
      update({ place: id });
      if (id && via === 'keyboard') setFocusKey(Date.now());
    },
    [update],
  );
  const onCompareFull = useCallback(() => setNotice('Compare holds three places. Remove one to add another.'), []);

  const chooseEntry = useCallback(
    (e: LayerEntry) => update({ metric: e.key, unit: e.family ? (unitParam ?? null) : null }),
    [update, unitParam],
  );
  const chooseUnit = useCallback((slug: string) => update({ metric: resolved.entry?.key ?? null, unit: slug }), [update, resolved.entry]);
  const chooseNoc = useCallback(
    (code: string | null) => {
      if (code) update({ noc: code, metric: WAGE_LAYER_KEY });
      else update({ noc: null, metric: metricParam === WAGE_LAYER_KEY ? null : metricParam });
    },
    [update, metricParam],
  );

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
            exclude: wageActive ? [] : (resolved.entry?.variants.map((v) => v.id) ?? []),
            preferUnitType: resolved.unitType,
            limit: 6,
          })
        : [],
    [placeId, core.metrics, core.obsIndex, wageActive, resolved.entry, resolved.unitType],
  );
  const insets = useMemo(() => (place ? (isMobile ? { bottom: SHEET_PEEK } : { right: DRAWER_W }) : undefined), [place, isMobile]);

  // ---------------------------------------------------------------- copy
  const entryTitle = wageActive ? 'Median wage' : (resolved.entry?.label ?? metric?.shortLabel ?? 'Map');
  const entrySub = wageActive ? (occupation?.title ?? `NOC ${noc}`) : resolved.unitType ? unitTypeShort(resolved.unitType) : null;
  const periodText = layer?.periods.length ? layer.periods.map((p) => formatPeriod(p.period, metric?.periodType)).join(', ') : '';
  const wageSummary =
    occupation && wageLayer ? (
      <>
        Median wages of employed workers by <strong>economic region (ER value)</strong>, Job Bank {formatPeriod(wages.data?.referencePeriod, 'period')}.{' '}
        {coverageLine(wageLayer)}
      </>
    ) : occupation && wages.loading ? (
      'Loading wages…'
    ) : wages.error ? (
      `Wages could not be loaded (${wages.error.message}).`
    ) : (
      'Adds a wage layer: what people employed in that occupation earn in each economic region.'
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
            {plural(core.places.length, 'Canadian city', 'Canadian cities')} on one honest scale — every number traced to the official source it came from.
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
          <section className="xp__section" aria-labelledby="xp-layer-h">
            <h2 id="xp-layer-h" className="xp__h">
              Map layer
            </h2>
            <MetricSwitcher
              catalog={catalog}
              activeKey={resolved.entry?.key ?? null}
              activeMetric={wageActive ? metric : resolved.metric}
              onSelectEntry={chooseEntry}
              onUnitChange={chooseUnit}
              wage={
                occupation
                  ? {
                      label: `Median wage: ${occupation.title}`,
                      title: `Median wage of employed ${occupation.title.toLowerCase()}`,
                      active: wageActive,
                      onSelect: () => update({ metric: WAGE_LAYER_KEY }),
                    }
                  : null
              }
            />
            {metric && <p className="xp__desc">{metric.description}</p>}
          </section>

          <section className="xp__section" aria-labelledby="xp-prof-h">
            <h2 id="xp-prof-h" className="xp__h">
              Profession lens
            </h2>
            <ProfessionPicker occupations={occupations.data} loading={occupations.loading} error={occupations.error} noc={noc} onChange={chooseNoc} summary={wageSummary} />
          </section>

          <section className="xp__section xp__section--where" aria-labelledby="xp-where-h">
            <h2 id="xp-where-h" className="xp__h">
              Where
            </h2>
            <WhereFilters region={region} prov={prov} onProv={(p) => update({ prov: p })} places={core.places} onPick={(id) => selectPlace(id, 'pointer')} />
          </section>
        </div>

        <div className="xp__regions">
          <RegionChips region={region} onRegion={(r) => update({ region: r, prov: null })} places={core.places} />
        </div>

        <div className="xp__results">
          <ResultsList
            rows={filtered.map((p) => ({ place: p, datum: layer?.data.get(p.id) }))}
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
              {entrySub && <span className="map-title__sub">{entrySub}</span>}
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

          {metric && <MapLegend metric={metric} layer={layer} scale={scale} pending={pending} collapsible={isMobile} className="map__legend" />}

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
          <PlaceDetail {...detailProps} hideHeader />
        </Sheet>
      )}

      <div className="toast" role="status" aria-live="polite">
        {notice && <p className="toast__msg">{notice}</p>}
      </div>
    </div>
  );
}

function coverageLine(layer: { counts: { ok: number; otherPeriod: number; notComparable: number; missing: number; total: number }; data: Map<string, { flags: string[]; value: number | null }> }) {
  let province = 0;
  for (const d of layer.data.values()) if (d.value !== null && d.flags.includes('provincial_value')) province++;
  const withValue = layer.counts.ok + layer.counts.otherPeriod;
  const parts = [`Values for ${withValue} of ${layer.counts.total} places`];
  if (province) parts.push(`${province} use a province-wide value (no ER cell)`);
  if (layer.counts.notComparable) parts.push(`${layer.counts.notComparable} on a different wage basis`);
  return parts.join('; ') + '.';
}
