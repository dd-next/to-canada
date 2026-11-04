/**
 * Data colour system.
 *
 *  - "higher is worse" (rent, unemployment): light sand -> deep brick
 *  - "higher is better" (wages, employment): pale sage -> deep pine/teal
 *  - neutral magnitudes (population, admissions): stone -> slate
 *  - temperature: fixed blue <-> red diverging ramp centred on 0 °C, so a given
 *    temperature has the same colour on every climate layer
 *  - signed non-temperature values: diverging around 0, sides chosen by direction
 *  - compare: three categorical colours that survive common colour-vision
 *    deficiencies (always paired with direct labels and shapes)
 *
 * Class scales are built from ALL places for a metric (never the filtered
 * subset), so colours and thresholds stay put while filters change.
 */
import { quantileSorted } from 'd3-array';
import type { MetricDef, Unit } from '../types/contract';

// ------------------------------------------------------------------ colour maths (sRGB <-> CIELAB)
type RGB = [number, number, number];
type Lab = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
export function rgbToHex([r, g, b]: RGB): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
const toLin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLin = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const Xn = 0.95047;
const Zn = 1.08883;
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const finv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));

function rgbToLab(rgb: RGB): Lab {
  const [r, g, b] = rgb.map(toLin);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / Xn;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / Zn;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function labToRgb([L, a, bb]: Lab): RGB {
  const fy = (L + 16) / 116;
  const x = finv(fy + a / 500) * Xn;
  const y = finv(fy);
  const z = finv(fy - bb / 200) * Zn;
  return [
    fromLin(3.2406 * x - 1.5372 * y - 0.4986 * z),
    fromLin(-0.9689 * x + 1.8758 * y + 0.0415 * z),
    fromLin(0.0557 * x - 0.204 * y + 1.057 * z),
  ];
}

/** Piecewise CIELAB interpolation along evenly spaced anchors, t in [0, 1]. */
export function interpolateAnchors(anchors: string[], t: number): string {
  if (anchors.length === 1) return anchors[0];
  const tt = Math.max(0, Math.min(1, t)) * (anchors.length - 1);
  const i = Math.min(anchors.length - 2, Math.floor(tt));
  const u = tt - i;
  const a = rgbToLab(hexToRgb(anchors[i]));
  const b = rgbToLab(hexToRgb(anchors[i + 1]));
  return rgbToHex(labToRgb([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]));
}

/** n colours sampled evenly from a ramp. */
export function ramp(anchors: string[], n: number, from = 0, to = 1): string[] {
  if (n <= 1) return [interpolateAnchors(anchors, (from + to) / 2)];
  return Array.from({ length: n }, (_, i) => interpolateAnchors(anchors, from + ((to - from) * i) / (n - 1)));
}

/** Relative luminance (WCAG). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export const INK = '#1f1d1a';
export const PAPER = '#f2ece1';
/** Ink or paper, whichever reads better on the given fill. */
export function textOn(fill: string): string {
  return contrastRatio(fill, INK) >= contrastRatio(fill, PAPER) ? INK : PAPER;
}

// ------------------------------------------------------------------ palettes
export const PALETTES = {
  /** higher is worse: sand -> brick */
  worse: ['#f1e2bf', '#e8c18c', '#d8945f', '#c06844', '#a03f2b', '#6e2618'],
  /** higher is better: sage -> pine */
  better: ['#e4e9cf', '#b8d0a9', '#80ae91', '#4f8a7c', '#2d6862', '#173f45'],
  /** neutral magnitudes: stone -> slate */
  neutral: ['#ebe4d5', '#cbc8bd', '#9ea6a6', '#70828e', '#485b6c', '#28394a'],
  /** used for the negative side of neutral signed values */
  neutralNeg: ['#ebe4d5', '#dcc59b', '#bf9a59', '#8e6c2f'],
} as const;

/** Temperature anchors (°C -> colour). Blue below 0, warm above. */
const TEMP_STOPS: [number, string][] = [
  [-30, '#142f52'],
  [-20, '#2b5a8c'],
  [-10, '#6b98c2'],
  [-3, '#bcd2e4'],
  [0, '#ebe7e0'],
  [3, '#f1cfb1'],
  [10, '#e29468'],
  [20, '#c3553a'],
  [30, '#7a2216'],
];
export function temperatureColor(t: number): string {
  if (t <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i];
    const [t0, c0] = TEMP_STOPS[i - 1];
    if (t <= t1) return interpolateAnchors([c0, c1], (t - t0) / (t1 - t0));
  }
  return TEMP_STOPS[TEMP_STOPS.length - 1][1];
}

/** Compare up to three places: brick, deep blue, ochre. Pair with labels + shapes. */
export const COMPARE_COLORS = ['#b5442f', '#2d5f8b', '#c8952c'] as const;
export const COMPARE_SHAPES = ['circle', 'square', 'diamond'] as const;
export type CompareShape = (typeof COMPARE_SHAPES)[number];
export const compareColor = (i: number) => COMPARE_COLORS[((i % 3) + 3) % 3];
export const compareShape = (i: number): CompareShape => COMPARE_SHAPES[((i % 3) + 3) % 3];

/** Missing data: hollow marker, dashed ink stroke. Use with class "is-missing" in SVG. */
export const MISSING_STYLE = { fill: PAPER, stroke: INK, dasharray: '2.5 2' } as const;
export const MISSING_LABEL = 'No comparable data';

// ------------------------------------------------------------------ class scales
export type Scheme = 'worse' | 'better' | 'neutral' | 'temperature' | 'diverging';

export interface ClassBin {
  /** inclusive lower bound (null = open) */
  lo: number | null;
  /** exclusive upper bound (null = open) */
  hi: number | null;
  color: string;
}

export interface ClassScale {
  scheme: Scheme;
  kind: 'sequential' | 'diverging';
  /** n-1 ascending breakpoints */
  thresholds: number[];
  colors: string[];
  bins: ClassBin[];
  /** min and max of the values the scale was built from */
  domain: [number, number];
  classOf(v: number): number;
  color(v: number | null | undefined): string | null;
  /** Value-bar geometry on the stable domain, as fractions [from, to] of the track (zero baseline). */
  bar(v: number): [number, number];
  /** Fraction where zero sits on the bar track. */
  zero: number;
}

type ScaleMetric = Pick<MetricDef, 'unit' | 'higherIs' | 'decimals'>;

function roundSig(v: number, sig: number): number {
  if (v === 0) return 0;
  const p = Math.floor(Math.log10(Math.abs(v))) - sig + 1;
  const m = 10 ** p;
  return Number((Math.round(v / m) * m).toFixed(Math.max(0, -p)));
}

/** Quantile breakpoints rounded to 2–4 significant digits without collapsing. */
function niceQuantiles(sorted: number[], n: number, decimals: number): number[] {
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const raw: number[] = [];
  for (let i = 1; i < n; i++) raw.push(quantileSorted(sorted, i / n) ?? min);
  for (let sig = 2; sig <= 5; sig++) {
    const minStep = 10 ** -decimals;
    const t = raw.map((v) => {
      const r = roundSig(v, sig);
      return Number((Math.round(r / minStep) * minStep).toFixed(decimals));
    });
    const uniq = [...new Set(t)].filter((x) => x > min && x <= max).sort((a, b) => a - b);
    if (uniq.length === raw.length || sig === 5) return uniq;
  }
  return [];
}

function makeScale(
  scheme: Scheme,
  kind: 'sequential' | 'diverging',
  thresholds: number[],
  colors: string[],
  domain: [number, number],
): ClassScale {
  const classOf = (v: number) => {
    let i = 0;
    while (i < thresholds.length && v >= thresholds[i]) i++;
    return i;
  };
  const lo = Math.min(0, domain[0]);
  const hi = Math.max(0, domain[1]);
  const span = hi - lo || 1;
  const zero = (0 - lo) / span;
  return {
    scheme,
    kind,
    thresholds,
    colors,
    domain,
    bins: colors.map((color, i) => ({ lo: i === 0 ? null : thresholds[i - 1], hi: i === colors.length - 1 ? null : thresholds[i], color })),
    classOf,
    color: (v) => (typeof v === 'number' && Number.isFinite(v) ? colors[classOf(v)] : null),
    bar: (v) => {
      const pos = (Math.max(lo, Math.min(hi, v)) - lo) / span;
      return [Math.min(zero, pos), Math.max(zero, pos)];
    },
    zero,
  };
}

function temperatureScale(values: number[], domain: [number, number]): ClassScale {
  const [min, max] = domain;
  const step = max - min < 15 ? 2.5 : 5;
  const thresholds: number[] = [];
  for (let t = Math.ceil((min + 1e-9) / step) * step; t <= max; t += step) thresholds.push(Number(t.toFixed(1)));
  if (thresholds.length === 0) thresholds.push(Math.round((min + max) / 2));
  // Every bin coloured by a fixed function of temperature at its middle.
  const mids = [thresholds[0] - step / 2, ...thresholds.slice(1).map((t, i) => (t + thresholds[i]) / 2), thresholds[thresholds.length - 1] + step / 2];
  void values;
  return makeScale('temperature', 'diverging', thresholds, mids.map(temperatureColor), domain);
}

function sequentialScale(scheme: 'worse' | 'better' | 'neutral', sorted: number[], classes: number, decimals: number): ClassScale {
  const uniq = new Set(sorted).size;
  const n = Math.max(1, Math.min(classes, uniq));
  const thresholds = n > 1 ? niceQuantiles(sorted, n, decimals) : [];
  const colors = ramp([...PALETTES[scheme]], thresholds.length + 1, thresholds.length + 1 <= 3 ? 0.15 : 0, 1);
  return makeScale(scheme, 'sequential', thresholds, colors, [sorted[0], sorted[sorted.length - 1]]);
}

function signedScale(higherIs: MetricDef['higherIs'], sorted: number[], decimals: number): ClassScale {
  const neg = sorted.filter((v) => v < 0);
  const pos = sorted.filter((v) => v >= 0);
  const nNeg = Math.min(2, Math.max(1, new Set(neg).size));
  const nPos = Math.min(3, Math.max(1, new Set(pos).size));
  const negT = nNeg > 1 ? niceQuantiles(neg, nNeg, decimals).filter((t) => t < 0) : [];
  const posT = nPos > 1 ? niceQuantiles(pos, nPos, decimals).filter((t) => t > 0) : [];
  const thresholds = [...negT, 0, ...posT];
  const negAnchors = higherIs === 'better' ? PALETTES.worse : higherIs === 'worse' ? PALETTES.better : PALETTES.neutralNeg;
  const posAnchors = higherIs === 'better' ? PALETTES.better : higherIs === 'worse' ? PALETTES.worse : PALETTES.neutral;
  const negColors = ramp([...negAnchors], negT.length + 1, 0.3, 0.85).reverse();
  const posColors = ramp([...posAnchors], posT.length + 1, 0.3, 0.9);
  return makeScale('diverging', 'diverging', thresholds, [...negColors, ...posColors], [sorted[0], sorted[sorted.length - 1]]);
}

/**
 * Build the stable class scale for a metric from every comparable value
 * (all places, not the filtered subset). Returns null when there is no data.
 */
export function buildClassScale(metric: ScaleMetric, values: Array<number | null | undefined>, opts: { classes?: number } = {}): ClassScale | null {
  const sorted = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const domain: [number, number] = [sorted[0], sorted[sorted.length - 1]];
  if (metric.unit === 'degC') return temperatureScale(sorted, domain);
  if (domain[0] < 0 && domain[1] > 0) return signedScale(metric.higherIs, sorted, metric.decimals);
  const scheme = metric.higherIs === 'better' ? 'better' : metric.higherIs === 'worse' ? 'worse' : 'neutral';
  return sequentialScale(scheme, sorted, opts.classes ?? 5, metric.decimals);
}

/** One-line reading guide for legends. */
export function scaleReading(metric: Pick<MetricDef, 'higherIs' | 'unit'>, scale: ClassScale | null): string {
  if (!scale) return '';
  if (scale.scheme === 'temperature') return 'Blue below 0 °C, red above';
  if (scale.scheme === 'diverging') return 'Diverges at zero';
  if (metric.higherIs === 'worse') return 'Darker = higher (worse for newcomers)';
  if (metric.higherIs === 'better') return 'Darker = higher (better)';
  return 'Darker = higher';
}

/** Unit-aware helper for threshold labels: compact for big counts and annual dollars. */
export function compactForUnit(unit: Unit, domainMax: number): boolean {
  return (unit === 'persons' || unit === 'count' || unit === 'CAD_year' || unit === 'CAD') && domainMax >= 100_000;
}
