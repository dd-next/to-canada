/** Layout shared by row charts (ranked bars, dot plots, ranges, stacked bars). */
import { FONT_LABEL, FONT_LABEL_STRONG, fitText, textWidth } from './measure';

export interface RowLayout {
  /** Width of the label column (labels are right-aligned at labelW). */
  labelW: number;
  plotL: number;
  plotR: number;
  rowH: number;
  top: number;
  /** Fitted label text per row. */
  labels: string[];
}

export function rowLayout(opts: { labels: string[]; width: number; rightReserve: number; top?: number; rowH?: number; minPlot?: number; strong?: boolean[] }): RowLayout {
  const { labels, width, rightReserve } = opts;
  const narrow = width < 520;
  const cap = Math.min(narrow ? width * 0.36 : width * 0.3, narrow ? 150 : 210);
  const widest = Math.max(30, ...labels.map((l, i) => textWidth(l, opts.strong?.[i] ? FONT_LABEL_STRONG : FONT_LABEL)));
  const labelW = Math.ceil(Math.min(cap, widest));
  const plotL = labelW + 12;
  const plotR = Math.max(plotL + (opts.minPlot ?? 60), width - rightReserve);
  return {
    labelW,
    plotL,
    plotR,
    rowH: opts.rowH ?? (labels.length > 30 ? 21 : 25),
    top: opts.top ?? 4,
    labels: labels.map((l, i) => fitText(l, labelW, opts.strong?.[i] ? FONT_LABEL_STRONG : FONT_LABEL)),
  };
}
