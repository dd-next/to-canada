import { geoPath } from 'd3-geo';
import { useMemo, useRef } from 'react';
import type { Place } from '../../types/contract';
import { useElementSize } from '../../lib/hooks';
import { CANADA_FRAME } from '../../lib/places';
import { makeProjection } from '../map/geo';
import { useCanadaGeo } from '../map/geo';

/** Small static map of Canada: every place as a dot, this one marked. Decorative orientation (aria-hidden), the text says where. */
export function LocatorMap({ place, places }: { place: Place; places: Place[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(ref);
  const { geo } = useCanadaGeo();
  const projection = useMemo(() => (width && height ? makeProjection(width, height, CANADA_FRAME, { top: 8, right: 8, bottom: 8, left: 8 }) : null), [width, height]);
  const paths = useMemo(() => {
    if (!projection || !geo) return null;
    const path = geoPath(projection);
    return {
      land: geo.provinces.features.map((f, i) => ({ key: f.properties?.code ?? String(i), d: path(f) ?? '', on: f.properties?.code === place.province })),
      borders: geo.interior ? (path(geo.interior) ?? '') : '',
      outline: path(geo.outline) ?? '',
    };
  }, [projection, geo, place.province]);
  const pt = projection?.([place.lon, place.lat]);
  return (
    <div ref={ref} className="locator" aria-hidden="true">
      {projection && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {paths && (
            <>
              {paths.land.map((l) => (
                <path key={l.key} d={l.d} className={l.on ? 'locator__land is-on' : 'locator__land'} />
              ))}
              {paths.borders && <path d={paths.borders} className="locator__borders" />}
              <path d={paths.outline} className="locator__outline" />
            </>
          )}
          {places.map((p) => {
            if (p.id === place.id) return null;
            const q = projection([p.lon, p.lat]);
            return q ? <circle key={p.id} cx={q[0]} cy={q[1]} r={2.25} className="locator__dot" /> : null;
          })}
          {pt && (
            <g>
              <circle cx={pt[0]} cy={pt[1]} r={11} className="locator__ring" />
              <circle cx={pt[0]} cy={pt[1]} r={5} className="locator__here" />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
