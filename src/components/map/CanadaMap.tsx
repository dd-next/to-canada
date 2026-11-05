import { geoPath } from 'd3-geo';
import { max } from 'd3-array';
import { scaleSqrt } from 'd3-scale';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Place } from '../../types/contract';
import { useElementSize, usePrefersReducedMotion } from '../../lib/hooks';
import { CANADA_FRAME, type MapFrame } from '../../lib/places';
import { IconButton } from '../ui/Button';
import { frameTransform, graticule, makeProjection, noInsets, type CanadaGeo, type Insets } from './geo';
import { dodge, placeLabels, resetMeasureCache, type LayoutNode } from './layout';

export interface MapMarker {
  id: string;
  name: string;
  lon: number;
  lat: number;
  /** Screen radius in px (constant under zoom). */
  r: number;
  /** Fill colour; null = no comparable data (hollow, dashed). */
  fill: string | null;
  /** Label priority (e.g. population). */
  priority: number;
  /** Full accessible name, e.g. "Halifax, Halifax CMA: $1,950/mo, Q3 2025". */
  ariaLabel: string;
}

export interface CanadaMapProps {
  /** Geometry; markers still render (on the graticule) while it loads. */
  geo: CanadaGeo | null;
  geoError?: Error;
  markers: MapMarker[];
  selectedId?: string | null;
  hoveredId?: string | null;
  /** Emphasise these places and dim the rest (Insight "show on map"). */
  highlightIds?: ReadonlySet<string> | null;
  /** Places outside the current filter: dimmed, still interactive. */
  dimmedIds?: ReadonlySet<string> | null;
  onSelect?: (id: string | null, via: 'pointer' | 'keyboard') => void;
  onHover?: (id: string | null) => void;
  /** Tooltip body for a hovered / focused marker. */
  renderTooltip?: (id: string) => ReactNode;
  /** Region preset to frame (null = all of Canada). */
  frame?: MapFrame | null;
  /** Changing this animates to `frame`. */
  frameKey?: string;
  /** Screen space covered by overlays (e.g. the detail drawer); framing and auto-pan avoid it. */
  insets?: Partial<Insets>;
  /** Extra padding for the whole-country fit (e.g. room for a legend docked at the top on phones). */
  fitPadding?: Partial<Insets>;
  /** Accessible name of the map. */
  label: string;
  /** Fill for CMA polygons (drawn when zoomed in, if the geometry has `cmas`). */
  cmaFill?: (placeId: string) => string | null;
  /** Overlays (legend, banners) positioned inside the map frame. */
  children?: ReactNode;
  className?: string;
}

const SCALE_EXTENT: [number, number] = [0.5, 48];
const CMA_ZOOM = 2.4;
const PAD: Insets = { top: 28, right: 28, bottom: 28, left: 28 };

/** Marker radius: area proportional to population (sqrt scale) with a readable minimum. */
export function populationRadius(places: Place[], opts: { min?: number; max?: number; fallback?: number } = {}) {
  const { min: rMin = 4.25, max: rMax = 17, fallback = 5.5 } = opts;
  const top = max(places, (p) => p.population?.value ?? 0) ?? 0;
  const s = scaleSqrt().domain([0, top || 1]).range([0, rMax]);
  return (p: Place) => (p.population?.value ? Math.max(rMin, s(p.population.value)) : fallback);
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function CanadaMap({
  geo,
  geoError,
  markers,
  selectedId = null,
  hoveredId = null,
  highlightIds = null,
  dimmedIds = null,
  onSelect,
  onHover,
  renderTooltip,
  frame = null,
  frameKey,
  insets: insetsProp,
  fitPadding,
  label,
  cmaFill,
  children,
  className,
}: CanadaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const animRef = useRef(0);
  const { width, height } = useElementSize(containerRef);
  const reduced = usePrefersReducedMotion();
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const [rovingId, setRovingId] = useState<string | null>(null);
  const [kbFocusId, setKbFocusId] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const [fontsTick, setFontsTick] = useState(0);
  const hintId = useId();
  const insets = useMemo(() => ({ ...noInsets, ...insetsProp }), [insetsProp]);

  const padTop = fitPadding?.top ?? PAD.top;
  const padRight = fitPadding?.right ?? PAD.right;
  const padBottom = fitPadding?.bottom ?? PAD.bottom;
  const padLeft = fitPadding?.left ?? PAD.left;
  const projection = useMemo(
    () => (width && height ? makeProjection(width, height, CANADA_FRAME, { top: padTop, right: padRight, bottom: padBottom, left: padLeft }) : null),
    [width, height, padTop, padRight, padBottom, padLeft],
  );
  const hoverIn = useCallback((e: { pointerType: string }, id: string) => {
    if (e.pointerType !== 'touch') onHover?.(id);
  }, [onHover]);
  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);

  // ---------------------------------------------------------------- static geometry (memoised: hover never re-renders it)
  const base = useMemo(() => {
    if (!path) return null;
    return (
      <>
        <path className="map__graticule" d={path(graticule) ?? undefined} />
        {geo && (
          <>
            <g className="map__land">
              {geo.provinces.features.map((f, i) => (
                <path key={f.properties?.code ?? i} className="map__province" data-code={f.properties?.code} d={path(f) ?? undefined}>
                  {f.properties?.name && <title>{f.properties.name}</title>}
                </path>
              ))}
            </g>
            {geo.interior && <path className="map__borders" d={path(geo.interior) ?? undefined} />}
            <path className="map__outline" d={path(geo.outline) ?? undefined} />
          </>
        )}
      </>
    );
  }, [path, geo]);

  const cmaPaths = useMemo(
    () => (path && geo?.cmas ? geo.cmas.features.map((f) => ({ id: f.properties?.placeId ?? '', name: f.properties?.name ?? '', d: path(f) ?? '' })) : []),
    [path, geo],
  );

  // ---------------------------------------------------------------- zoom behaviour
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent(SCALE_EXTENT)
      .filter((event: Event & { ctrlKey?: boolean; metaKey?: boolean; button?: number; type: string }) => {
        if (event.type === 'wheel') return !!(event.ctrlKey || event.metaKey);
        return !event.ctrlKey && !event.button;
      })
      .wheelDelta((e: WheelEvent) => -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.004) * (Math.abs(e.deltaY) < 30 ? 3 : 1))
      .on('start', (e) => {
        if (e.sourceEvent) cancelAnimationFrame(animRef.current);
      })
      .on('zoom', (e) => setT(e.transform));
    zoomRef.current = z;
    const sel = select(svg).call(z);
    return () => {
      sel.on('.zoom', null);
    };
  }, []);

  useEffect(() => {
    if (!width || !height) return;
    zoomRef.current
      ?.extent([
        [0, 0],
        [width, height],
      ])
      .translateExtent([
        [-width * 0.6, -height * 1.1],
        [width * 1.6, height * 1.5],
      ]);
  }, [width, height]);

  const apply = useCallback(
    (target: ZoomTransform, animate: boolean) => {
      const svg = svgRef.current;
      const z = zoomRef.current;
      if (!svg || !z) return;
      cancelAnimationFrame(animRef.current);
      const sel = select(svg);
      if (!animate || reduced || !width) {
        z.transform(sel, target);
        return;
      }
      const start = zoomTransform(svg);
      const c0 = [(width / 2 - start.x) / start.k, (height / 2 - start.y) / start.k];
      const c1 = [(width / 2 - target.x) / target.k, (height / 2 - target.y) / target.k];
      const t0 = performance.now();
      const dur = 320;
      const step = (now: number) => {
        const u = Math.min(1, (now - t0) / dur);
        const e = 1 - (1 - u) ** 3;
        const k = start.k * (target.k / start.k) ** e;
        const cx = c0[0] + (c1[0] - c0[0]) * e;
        const cy = c0[1] + (c1[1] - c0[1]) * e;
        z.transform(sel, zoomIdentity.translate(width / 2 - k * cx, height / 2 - k * cy).scale(k));
        if (u < 1) animRef.current = requestAnimationFrame(step);
      };
      animRef.current = requestAnimationFrame(step);
    },
    [reduced, width, height],
  );

  const targetFor = useCallback(
    (box: MapFrame | null) => {
      if (!projection) return zoomIdentity;
      if (!box && !insets.right && !insets.left) return zoomIdentity;
      return frameTransform(projection, box ?? CANADA_FRAME, width, height, { ...insets, top: insets.top + 8, bottom: insets.bottom + 8 }, SCALE_EXTENT, box ? 0.92 : 0.96);
    },
    [projection, width, height, insets],
  );

  // Size change: re-frame immediately. Frame change: animate.
  const frameRef = useRef(frame);
  frameRef.current = frame;
  useEffect(() => {
    if (projection) apply(targetFor(frameRef.current), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection]);
  const firstKey = useRef(true);
  useEffect(() => {
    if (firstKey.current) {
      firstKey.current = false;
      return;
    }
    if (projection) apply(targetFor(frameRef.current), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  const zoomBy = useCallback(
    (factor: number) => {
      const svg = svgRef.current;
      const z = zoomRef.current;
      if (!svg || !z || !width) return;
      const cur = zoomTransform(svg);
      const k = Math.max(SCALE_EXTENT[0], Math.min(SCALE_EXTENT[1], cur.k * factor));
      const vx = (insets.left + width - insets.right) / 2;
      const vy = height / 2;
      const cx = (vx - cur.x) / cur.k;
      const cy = (vy - cur.y) / cur.k;
      const target = z.constrain()(
        zoomIdentity.translate(vx - k * cx, vy - k * cy).scale(k),
        [
          [0, 0],
          [width, height],
        ],
        z.translateExtent(),
      );
      apply(target, true);
    },
    [apply, width, height, insets],
  );
  const reset = useCallback(() => apply(targetFor(frameRef.current), true), [apply, targetFor]);

  // ---------------------------------------------------------------- fonts → re-measure labels
  useEffect(() => {
    let alive = true;
    document.fonts?.ready.then(() => {
      if (!alive) return;
      resetMeasureCache();
      setFontsTick((v) => v + 1);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ---------------------------------------------------------------- plain-wheel hint (page scroll is never hijacked)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timer = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      setHint(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setHint(false), 1400);
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.clearTimeout(timer);
    };
  }, []);

  // ---------------------------------------------------------------- marker layout (screen space)
  const projected = useMemo(() => {
    if (!projection) return [];
    return markers.map((m) => {
      const p = projection([m.lon, m.lat]) ?? [0, 0];
      return { m, px: p[0], py: p[1] };
    });
  }, [projection, markers]);

  const nodes = useMemo(() => {
    const ln: (LayoutNode & { m: MapMarker })[] = projected.map(({ m, px, py }) => ({ id: m.id, m, x0: t.applyX(px), y0: t.applyY(py), r: m.r, x: 0, y: 0 }));
    dodge(ln);
    return ln;
  }, [projected, t]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Remember the framing from before a selection and restore it when the selection is cleared.
  const preSelect = useRef<ZoomTransform | null>(null);
  const prevSelected = useRef<string | null>(null);
  useEffect(() => {
    const was = prevSelected.current;
    prevSelected.current = selectedId;
    const svg = svgRef.current;
    if (!svg || !projection) return;
    if (selectedId && !was) preSelect.current = zoomTransform(svg);
    else if (!selectedId && was && preSelect.current) {
      apply(preSelect.current, true);
      preSelect.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);
  useEffect(() => {
    preSelect.current = null; // a new region framing supersedes the saved view
  }, [frameKey]);

  // Keep the selected place visible (not under the drawer).
  useEffect(() => {
    if (!selectedId || !projection || !width) return;
    const n = projected.find((p) => p.m.id === selectedId);
    const svg = svgRef.current;
    if (!n || !svg) return;
    const cur = zoomTransform(svg);
    const sx = cur.applyX(n.px);
    const sy = cur.applyY(n.py);
    const m = Math.max(16, n.m.r + 6);
    const left = insets.left + m;
    const right = width - insets.right - m;
    const top = insets.top + m;
    const bottom = height - insets.bottom - m;
    if (sx >= left && sx <= right && sy >= top && sy <= bottom) return;
    const vx = (left + right) / 2;
    const vy = (top + bottom) / 2;
    apply(zoomIdentity.translate(cur.x + (vx - sx), cur.y + (vy - sy)).scale(cur.k), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, insets.right, insets.bottom, projection]);

  const labels = useMemo(() => {
    if (!width) return [];
    const inputs = nodes
      .filter((n) => {
        if (n.id === selectedId || n.id === hoveredId) return true;
        if (highlightIds) return highlightIds.has(n.id);
        if (dimmedIds?.has(n.id)) return false;
        return true;
      })
      .map((n) => {
        const sel = n.id === selectedId;
        const hov = n.id === hoveredId || n.id === kbFocusId;
        const hi = !!highlightIds?.has(n.id);
        return {
          id: n.id,
          text: n.m.name,
          x: n.x,
          y: n.y,
          r: n.r + (sel ? 3 : 0),
          priority: (sel ? 4e9 : 0) + (hov ? 3e9 : 0) + (hi ? 2e9 : 0) + n.m.priority,
          force: sel || hov,
          size: sel ? 14 : 12,
          weight: sel ? 800 : hov ? 700 : 600,
        };
      });
    return placeLabels(
      inputs,
      nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, r: n.r })),
      { x: 4, y: 4, w: width - 8 - insets.right, h: height - 8 },
    );
    // fontsTick forces re-measurement once web fonts are ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, selectedId, hoveredId, kbFocusId, highlightIds, dimmedIds, width, height, insets.right, fontsTick]);

  // Draw order: big first, then emphasised on top.
  const drawOrder = useMemo(() => {
    const rank = (n: (typeof nodes)[number]) => (n.id === selectedId ? 3 : n.id === hoveredId ? 2 : highlightIds?.has(n.id) ? 1 : 0);
    return [...nodes].sort((a, b) => rank(a) - rank(b) || b.r - a.r);
  }, [nodes, selectedId, hoveredId, highlightIds]);

  const roving = rovingId && nodeById.has(rovingId) ? rovingId : (selectedId ?? [...nodes].sort((a, b) => b.m.priority - a.m.priority)[0]?.id ?? null);

  const focusMarker = (id: string) => {
    setRovingId(id);
    const el = svgRef.current?.querySelector<SVGGElement>(`[data-id="${CSS.escape(id)}"]`);
    el?.focus();
  };

  const onMarkerKey = (e: KeyboardEvent<SVGGElement>, id: string) => {
    const k = e.key;
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      onSelect?.(id, 'keyboard');
      return;
    }
    if (k === 'Escape' && selectedId) {
      e.preventDefault();
      onSelect?.(null, 'keyboard');
      return;
    }
    if (k === '+' || k === '=') {
      e.preventDefault();
      zoomBy(1.6);
      return;
    }
    if (k === '-' || k === '_') {
      e.preventDefault();
      zoomBy(1 / 1.6);
      return;
    }
    if (k === '0') {
      e.preventDefault();
      reset();
      return;
    }
    const dir = k === 'ArrowRight' ? [1, 0] : k === 'ArrowLeft' ? [-1, 0] : k === 'ArrowUp' ? [0, -1] : k === 'ArrowDown' ? [0, 1] : null;
    if (!dir) return;
    e.preventDefault();
    const from = nodeById.get(id);
    if (!from) return;
    let best: string | null = null;
    let bestScore = Infinity;
    for (const n of nodes) {
      if (n.id === id) continue;
      const dx = n.x - from.x;
      const dy = n.y - from.y;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 0.5) continue;
      const across = Math.abs(dx * dir[1] - dy * dir[0]);
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = n.id;
      }
    }
    if (best) focusMarker(best);
  };

  // ---------------------------------------------------------------- tooltip
  const tipId = hoveredId ?? kbFocusId;
  const tipNode = tipId ? nodeById.get(tipId) : undefined;
  const tipVisible = !!(tipNode && renderTooltip && tipNode.x > -20 && tipNode.x < width + 20 && tipNode.y > -20 && tipNode.y < height + 20);
  // Tooltip placement: right of the marker, else left, else centred above/below (narrow maps).
  const TIP_W = 272;
  const visRight = width - insets.right;
  const tipMode: 'right' | 'left' | 'center' = !tipNode
    ? 'right'
    : tipNode.x + tipNode.r + 14 + TIP_W <= visRight - 8
      ? 'right'
      : tipNode.x - tipNode.r - 14 - TIP_W >= 8
        ? 'left'
        : 'center';
  const tipBelow = tipNode ? (tipMode === 'center' ? tipNode.y < height / 2 : tipNode.y < 150) : false;
  const tipStyle = tipNode
    ? {
        left: tipMode === 'center' ? Math.max(8, Math.min(tipNode.x - TIP_W / 2, visRight - TIP_W - 8)) : tipNode.x,
        top: tipNode.y,
        ['--tip-offset' as string]: `${tipNode.r + 12}px`,
      }
    : undefined;

  const showCmas = cmaPaths.length > 0 && t.k >= CMA_ZOOM;

  return (
    <div ref={containerRef} className={['map', className].filter(Boolean).join(' ')} data-zoomed={t.k > 1.05 ? 'true' : undefined}>
      <svg
        ref={svgRef}
        className="map__svg"
        width={width || undefined}
        height={height || undefined}
        role="group"
        aria-label={label}
        aria-describedby={hintId}
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as Element).classList?.contains('map__bg')) onSelect?.(null, 'pointer');
        }}
      >
        <rect className="map__bg" x={0} y={0} width={width} height={height} />
        <g className="map__geo" transform={t.toString()}>
          {base}
          {showCmas && (
            <g className="map__cmas">
              {cmaPaths.map((c) => {
                const fill = cmaFill?.(c.id);
                return (
                  <path
                    key={c.id + c.name}
                    d={c.d}
                    className={['map__cma', !fill && 'is-missing', c.id === selectedId && 'is-selected', dimmedIds?.has(c.id) && 'is-filtered'].filter(Boolean).join(' ')}
                    style={fill ? { fill } : undefined}
                    onPointerEnter={(e) => hoverIn(e, c.id)}
                    onPointerLeave={() => onHover?.(null)}
                    onClick={() => onSelect?.(c.id, 'pointer')}
                  />
                );
              })}
            </g>
          )}
        </g>
        <g className="map__leaders" aria-hidden="true">
          {nodes.map((n) =>
            Math.hypot(n.x - n.x0, n.y - n.y0) > 2.5 ? (
              <g key={n.id} className={dimmedIds?.has(n.id) || (highlightIds && !highlightIds.has(n.id)) ? 'is-dim' : undefined}>
                <line x1={n.x0} y1={n.y0} x2={n.x} y2={n.y} />
                <circle cx={n.x0} cy={n.y0} r={1.6} />
              </g>
            ) : null,
          )}
        </g>
        <g className="map__markers">
          {drawOrder.map((n) => {
            const m = n.m;
            const sel = m.id === selectedId;
            const hov = m.id === hoveredId;
            const hi = !!highlightIds?.has(m.id);
            const dim = (highlightIds && !hi) || (!highlightIds && dimmedIds?.has(m.id));
            const cls = [
              'map-marker',
              m.fill === null && 'is-missing',
              sel && 'is-selected',
              hov && 'is-hovered',
              hi && 'is-highlighted',
              dim && 'is-dim',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <g
                key={m.id}
                data-id={m.id}
                className={cls}
                transform={`translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`}
                role="button"
                tabIndex={m.id === roving ? 0 : -1}
                aria-label={m.ariaLabel}
                aria-pressed={sel}
                onPointerEnter={(e) => hoverIn(e, m.id)}
                onPointerLeave={() => onHover?.(null)}
                onFocus={(e) => {
                  setRovingId(m.id);
                  // Tooltip on keyboard focus only (taps and clicks also focus the marker).
                  let visible = true;
                  try {
                    visible = e.currentTarget.matches(':focus-visible');
                  } catch {
                    /* older engines */
                  }
                  if (visible) setKbFocusId(m.id);
                }}
                onBlur={() => setKbFocusId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(m.id, e.detail === 0 ? 'keyboard' : 'pointer');
                }}
                onKeyDown={(e) => onMarkerKey(e, m.id)}
              >
                <circle className="map-marker__hit" r={Math.max(m.r + 3, 11)} />
                <circle className="map-marker__halo" r={m.r + 1.75} />
                <circle className="map-marker__dot" r={m.r} style={m.fill ? { fill: m.fill } : undefined} />
                <circle className="map-marker__ring" r={m.r + 4} />
              </g>
            );
          })}
        </g>
        <g className="map__labels" aria-hidden="true">
          {labels.map((l) => (
            <text
              key={l.id}
              x={l.x}
              y={l.y}
              textAnchor={l.anchor}
              className={[
                'map-label',
                l.id === selectedId && 'is-selected',
                (l.id === hoveredId || l.id === kbFocusId) && 'is-hovered',
                highlightIds?.has(l.id) && 'is-highlighted',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ fontSize: l.size, fontWeight: l.weight }}
              onPointerEnter={(e) => hoverIn(e, l.id)}
              onPointerLeave={() => onHover?.(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelect?.(l.id, 'pointer');
              }}
            >
              {l.text}
            </text>
          ))}
        </g>
      </svg>

      <p id={hintId} className="sr-only">
        Each place is a button. Use the arrow keys to move between places, Enter to open details, plus and minus to zoom. The list of places is an alternative to the map.
      </p>

      <div className="map__controls" style={insets.right ? { right: insets.right + 12 } : undefined}>
        <IconButton icon="plus" label="Zoom in" variant="outline" onClick={() => zoomBy(1.6)} />
        <IconButton icon="minus" label="Zoom out" variant="outline" onClick={() => zoomBy(1 / 1.6)} />
        <IconButton icon="reset" label="Reset view" variant="outline" onClick={reset} />
      </div>

      <div className={['map__hint', hint && 'is-visible'].filter(Boolean).join(' ')} aria-hidden="true">
        Hold {isMac ? '⌘' : 'Ctrl'} and scroll to zoom · or use + and −
      </div>

      {!geo && (
        <div className="map__status" role="status">
          {geoError ? 'Map outline unavailable — places are still shown.' : 'Loading map…'}
        </div>
      )}

      {tipVisible && tipNode && (
        <div
          className={['map-tip', `map-tip--${tipMode}`, tipBelow && 'map-tip--below'].filter(Boolean).join(' ')}
          style={tipStyle}
          role="tooltip"
        >
          {renderTooltip!(tipId!)}
        </div>
      )}

      {children}
    </div>
  );
}
