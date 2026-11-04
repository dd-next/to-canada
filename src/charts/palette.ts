/**
 * Chart colours. Place highlights always use the app's compare colours
 * (brick, deep blue, ochre — src/lib/colors), so a place keeps the same colour
 * on the map, in the compare tray and in every chart. Everything that is not
 * highlighted stays in ink or a recessive warm grey.
 *
 * Categorical series that are not places (e.g. admission categories) take the
 * compare colours in fixed order, then violet. The order is validated with the
 * dataviz palette checker against the paper surface: CVD separation and the
 * normal-vision floor pass; the deep blue reads low-chroma and the ochre sits
 * below 3:1 on paper, so every series is also direct-labelled or keyed by shape
 * and every chart has a data table.
 */
import { COMPARE_COLORS } from '../lib/colors';

export const CHART_INK = '#272727';
/** Single-series marks when nothing is highlighted. */
export const CHART_BASE = '#544d46';
/** De-emphasised bars/areas while other marks are highlighted. */
export const CHART_CONTEXT = '#cdbfb0';
/** De-emphasised lines (a step darker than CONTEXT so thin strokes stay visible). */
export const CHART_CONTEXT_LINE = '#ad9f90';
/** Range bars (low–high) when not highlighted. */
export const CHART_RANGE = '#c3b4a3';
/** Connector between dots in a dot plot. */
export const CHART_CONNECTOR = '#b4a697';
export const CHART_SURFACE = '#f6ece3';

/** Fixed categorical order for non-place series. */
export const SERIES_COLORS = [COMPARE_COLORS[0], COMPARE_COLORS[1], COMPARE_COLORS[2], '#6b4c9a', '#2d6862', '#5d544b'] as const;
export const seriesColor = (i: number) => SERIES_COLORS[((i % SERIES_COLORS.length) + SERIES_COLORS.length) % SERIES_COLORS.length];

/** Shapes paired with series colours (secondary encoding). */
export type MarkShape = 'circle' | 'square' | 'diamond' | 'triangle';
export const SERIES_SHAPES: MarkShape[] = ['circle', 'square', 'diamond', 'triangle'];
export const seriesShape = (i: number): MarkShape => SERIES_SHAPES[((i % SERIES_SHAPES.length) + SERIES_SHAPES.length) % SERIES_SHAPES.length];

/** Climate panel colours. */
export const CLIMATE = {
  band: 'rgb(181 68 47 / 0.16)',
  bandStroke: 'rgb(181 68 47 / 0.55)',
  mean: '#a63d2a',
  precip: '#2d5f8b',
  snow: '#8fa9c2',
  zero: '#2d5f8b',
} as const;
