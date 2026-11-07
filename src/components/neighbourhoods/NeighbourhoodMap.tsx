import { useId, useMemo, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { Link } from 'react-router-dom';
import type { FeatureCollection, Geometry } from 'geojson';
import type { NeighbourhoodBundle } from '../../types/neighbourhoods';
import { hasProfile } from './coverage';

export function NeighbourhoodMap({ bundle, layer, selected, focus, visibleIds }: {
  bundle: NeighbourhoodBundle; layer: string; selected?: string; focus?: string; visibleIds?: Set<string>;
}) {
  const pattern = useId().replace(/:/g, '');
  const [hovered, setHovered] = useState<string>();
  const features = useMemo<FeatureCollection<Geometry>>(() => ({ type: 'FeatureCollection', features: bundle.neighbourhoods.map(n => ({ type: 'Feature', geometry: n.geometry, properties: { id: n.id } })) }), [bundle]);
  const projection = useMemo(() => {
    const target = focus ? features.features.find(f => f.properties?.id === focus) : undefined;
    return geoMercator().fitExtent([[35, 35], [685, 505]], target ?? features);
  }, [features, focus]);
  const path = geoPath(projection);
  const definition = bundle.definitions[layer];
  const max = definition?.unit === 'percent' ? 100 : Math.max(1, ...bundle.neighbourhoods.map(n => n.metrics[layer]?.value ?? 0));
  const activeArea = bundle.neighbourhoods.find(n => n.id === (hovered ?? selected ?? focus));
  const suffix = definition?.unit === 'percent' ? '%' : definition?.unit === 'CAD_month' ? ' CAD/month' : '';
  const describe = (value: number | null | undefined) => value == null ? 'Not available' : `${value.toLocaleString('en-CA')}${suffix}`;
  return (
    <figure className="hood-map">
      <svg viewBox="0 0 720 540" role="group" aria-label={`${bundle.cityName} neighbourhood map. Use the searchable list to open a profile.`}>
        <defs>
          <pattern id={pattern} width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0,7L7,0" stroke="var(--paper-3)" strokeWidth="2" /></pattern>
          <clipPath id={`${pattern}-clip`}><rect width="720" height="540" /></clipPath>
        </defs>
        <g clipPath={`url(#${pattern}-clip)`}>
          {features.features.map((f, i) => {
            const n = bundle.neighbourhoods[i];
            const value = n.metrics[layer]?.value;
            const active = n.id === (hovered ?? selected ?? focus);
            const covered = hasProfile(n);
            const fill = value == null || !covered ? `url(#${pattern})` : active ? 'var(--accent)' : `hsl(174 30% ${94 - 66 * Math.min(1, value / max)}%)`;
            const title = `${n.name}: ${covered ? `${definition.label}: ${describe(value)}${value == null ? `. ${n.metrics[layer]?.missingReason ?? ''}` : ''}` : 'Mapped boundary only. Profile data unavailable.'}`;
            const area = <path d={path(f) ?? undefined} fill={fill} stroke={active ? 'var(--ink)' : 'var(--paper-hi)'} strokeWidth={active ? 1.7 : 0.65} opacity={!visibleIds || visibleIds.has(n.id) ? 1 : 0.16}><title>{title}</title></path>;
            return covered ? <Link key={n.id} to={`/place/${bundle.placeId}/neighbourhoods/${n.id}`} tabIndex={-1} aria-label={`Open ${n.name}`} onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(undefined)} onFocus={() => setHovered(n.id)}>{area}</Link>
              : <g key={n.id} tabIndex={0} role="img" aria-label={title} onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(undefined)} onFocus={() => setHovered(n.id)} onClick={() => setHovered(n.id)}>{area}</g>;
          })}
          {bundle.stations.map(station => {
            const p = projection([station.lon, station.lat]);
            return p ? <circle key={station.id} cx={p[0]} cy={p[1]} r={focus ? 4 : 2.8} fill="var(--ink)" stroke="var(--paper-hi)" strokeWidth="1"><title>{station.name}</title></circle> : null;
          })}
        </g>
        <text x="680" y="28" className="hood-map__north" textAnchor="end">N ↑</text>
      </svg>
      <figcaption>
        <strong>{activeArea ? `${activeArea.name}${hasProfile(activeArea) ? ` · ${describe(activeArea.metrics[layer]?.value)}` : ' · Mapped boundary only; profile data unavailable.'}` : 'Select an area to explore'}</strong>
        <span>{definition?.label}: <i className="hood-map__gradient" aria-hidden="true" /> 0–{max.toLocaleString('en-CA')}{suffix} · hatched = unavailable{bundle.stations.length > 0 && ' · dots = rail stations'}</span>
        <small>Boundary vintage: {bundle.boundaryVintage}. Each data layer has its own observation period.</small>
      </figcaption>
    </figure>
  );
}
