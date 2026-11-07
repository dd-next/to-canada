import { useId, useMemo, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { Link } from 'react-router-dom';
import type { FeatureCollection, Geometry } from 'geojson';
import type { NeighbourhoodBundle } from '../../types/neighbourhoods';

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
  const max = layer === 'rail' ? Math.max(1, ...bundle.neighbourhoods.map(n => n.metrics[layer]?.value ?? 0)) : 100;
  const label = bundle.neighbourhoods.find(n => n.id === (hovered ?? selected ?? focus))?.name;
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
            const fill = active ? 'var(--accent)' : value == null ? `url(#${pattern})` : `hsl(174 30% ${94 - 66 * Math.min(1, value / max)}%)`;
            return <Link key={n.id} to={`/place/${bundle.placeId}/neighbourhoods/${n.id}`} tabIndex={-1} aria-label={`Open ${n.name}`} onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(undefined)}>
              <path d={path(f) ?? undefined} fill={fill} stroke={active ? 'var(--ink)' : 'var(--paper-hi)'} strokeWidth={active ? 1.7 : 0.65} opacity={!visibleIds || visibleIds.has(n.id) ? 1 : 0.16}><title>{n.name}: {value == null ? 'Not available' : `${value}${layer === 'rail' ? ' stations' : '%'}`}</title></path>
            </Link>;
          })}
          {bundle.stations.map(station => {
            const p = projection([station.lon, station.lat]);
            return p ? <circle key={station.id} cx={p[0]} cy={p[1]} r={focus ? 4 : 2.8} fill="var(--ink)" stroke="var(--paper-hi)" strokeWidth="1"><title>{station.name}</title></circle> : null;
          })}
        </g>
        <text x="680" y="28" className="hood-map__north" textAnchor="end">N ↑</text>
      </svg>
      <figcaption>
        <strong>{label ?? 'Select an area to explore'}</strong>
        <span>{bundle.definitions[layer]?.label}: <i className="hood-map__gradient" aria-hidden="true" /> 0–{max}{layer === 'rail' ? ' stations' : '%'} · hatched = unavailable · dots = LRT</span>
        <small>Boundaries: City of {bundle.cityName}, {bundle.boundaryVintage}. Park and transit layers are later snapshots.</small>
      </figcaption>
    </figure>
  );
}
