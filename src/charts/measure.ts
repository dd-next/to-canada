/** Text measurement for chart layout (labels never get clipped by guesswork). */
import { useEffect, useState } from 'react';

export const FONT_LABEL = '600 12px "Archivo Variable", Archivo, "Helvetica Neue", Arial, sans-serif';
export const FONT_LABEL_STRONG = '800 12px "Archivo Variable", Archivo, "Helvetica Neue", Arial, sans-serif';
export const FONT_VALUE = '700 12px "Archivo Variable", Archivo, "Helvetica Neue", Arial, sans-serif';
export const FONT_TICK = '400 10px "IBM Plex Mono", ui-monospace, Menlo, monospace';

let ctx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();

/** Rendered width of `text` in px for a CSS font shorthand. Falls back to an estimate without canvas. */
export function textWidth(text: string, font: string = FONT_LABEL): number {
  const key = `${font}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (ctx === undefined) {
    try {
      ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    } catch {
      ctx = null;
    }
  }
  let w: number;
  if (ctx) {
    ctx.font = font;
    w = ctx.measureText(text).width;
  } else {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 12);
    w = text.length * size * (font.includes('Mono') ? 0.6 : 0.56);
  }
  // Uppercase tick labels carry letter-spacing in CSS; mono ticks are 10px with 0.04em.
  if (font === FONT_TICK) w += text.length * 0.4;
  cache.set(key, w);
  return w;
}

/** Shorten a label with an ellipsis so it fits `max` px. */
export function fitText(text: string, max: number, font: string = FONT_LABEL): string {
  if (textWidth(text, font) <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(`${text.slice(0, mid).trimEnd()}…`, font) <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo <= 0 ? '…' : `${text.slice(0, lo).trimEnd()}…`;
}

let fontsReady = typeof document === 'undefined' || !('fonts' in document) || document.fonts.status === 'loaded';
const waiters = new Set<() => void>();
if (!fontsReady && typeof document !== 'undefined' && 'fonts' in document) {
  document.fonts.ready.then(() => {
    fontsReady = true;
    cache.clear();
    waiters.forEach((w) => w());
    waiters.clear();
  });
}

/** Re-render once web fonts have loaded so measured layouts use the real metrics. */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(fontsReady);
  useEffect(() => {
    if (ready) return;
    if (fontsReady) {
      setReady(true);
      return;
    }
    const w = () => setReady(true);
    waiters.add(w);
    return () => {
      waiters.delete(w);
    };
  }, [ready]);
  return ready;
}
