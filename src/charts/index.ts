/**
 * Northward chart system. Use ChartRenderer for any contract ChartSpec; the
 * primitives are exported for custom layouts and the place profile.
 */
export { ChartRenderer, type ChartRendererProps } from './ChartRenderer';
export { StripPlot, type StripItem, type StripPlotProps } from './StripPlot';
export { ChartDataTable } from './DataTable';
export { climateRole, climateMonths, climateGroups, type ClimateRole, type ClimateMonth, type ClimateGroup } from './MonthlyClimateChart';
export { chartSummary, missingNote, chartDecimals } from './text';
export { SERIES_COLORS, seriesColor, seriesShape, CHART_BASE, CHART_CONTEXT, CHART_CONTEXT_LINE } from './palette';
export { SeriesKey } from './core';
